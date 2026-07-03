"""Engine invocation: pure helpers (URL parsing, spec/toml rendering, report
normalization) plus the real (subprocess) and mock execution paths.

The engine (autoresttest-core) is treated as a black box:
  * per-run settings that have no CLI flag are written into the core's
    `configurations.toml` (backed up and restored around each run);
  * spec + duration are passed via `-s` / `-t`;
  * the target URL is injected into the spec's `servers` list (the engine's
    `[api].override_url` path only supports plain http host:port);
  * the interactive "Start testing?" prompt is auto-confirmed by closing stdin
    (input() raises EOF -> the prompt returns its default of True).
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import tomlkit
import yaml

from .config import Config

# HTTP methods the platform models as Endpoint rows (mirrors the Prisma
# HttpMethod enum). Other verbs the engine may touch are ignored for mapping.
_MAPPED_METHODS = ("get", "post", "put", "patch", "delete")


# --------------------------------------------------------------------------- #
# Pure helpers (unit-tested directly)
# --------------------------------------------------------------------------- #
def validate_target_url(url: str) -> str:
    """Ensure the target URL has a scheme and host; return it unchanged."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError(
            "targetUrl must be an absolute http(s) URL, e.g. http://localhost:8080"
        )
    return url


def inject_target_url(spec_text: str, target_url: str) -> str:
    """Parse the OAS YAML/JSON and force its `servers` to the target URL so the
    engine sends requests there. Returns YAML text."""
    spec = yaml.safe_load(spec_text)
    if not isinstance(spec, dict):
        raise ValueError("Spec did not parse into an object")
    spec["servers"] = [{"url": target_url}]
    return yaml.safe_dump(spec, sort_keys=False)


def render_config_toml(
    *,
    spec_location: str,
    time_duration: int,
    mutation_rate: float,
    llm_engine: str,
    llm_api_base: str,
    auth_header: Optional[str],
) -> str:
    """Render a per-run configurations.toml for the engine."""
    doc = tomlkit.document()

    spec = tomlkit.table()
    spec["location"] = spec_location
    spec["recursion_limit"] = 1
    spec["strict_validation"] = False
    doc["spec"] = spec

    llm = tomlkit.table()
    llm["engine"] = llm_engine
    llm["creative_temperature"] = 1
    llm["strict_temperature"] = 1
    llm["api_base"] = llm_api_base
    llm["max_tokens"] = 30000
    doc["llm"] = llm

    # Both `agents` and `agent` are required (no defaults) on the core's Config
    # model. The Header Agent only supports Basic auth, so keep it disabled;
    # `[agent]` can be an empty table since AgentCombinationConfig defaults it all.
    agents = tomlkit.table()
    header_agent = tomlkit.table()
    header_agent["enabled"] = False
    agents["header"] = header_agent
    doc["agents"] = agents

    agent = tomlkit.table()
    agent["max_combinations"] = 12
    agent["max_total_combinations"] = 3000
    agent["base_samples_per_size"] = 200
    agent["combination_seed"] = 42
    doc["agent"] = agent

    cache = tomlkit.table()
    cache["use_cached_graph"] = False
    cache["use_cached_table"] = False
    doc["cache"] = cache

    q = tomlkit.table()
    q["learning_rate"] = 0.1
    q["discount_factor"] = 0.9
    q["max_exploration"] = 1
    doc["q_learning"] = q

    rg = tomlkit.table()
    rg["time_duration"] = time_duration
    rg["mutation_rate"] = mutation_rate
    doc["request_generation"] = rg

    api = tomlkit.table()
    api["override_url"] = False  # URL comes from the injected `servers`
    api["host"] = "localhost"
    api["port"] = 8080
    doc["api"] = api

    if auth_header:
        headers = tomlkit.table()
        headers["Authorization"] = auth_header
        doc["custom_headers"] = headers

    return tomlkit.dumps(doc)


def normalize_report(
    report: Dict[str, Any],
    operation_status_codes: Any,
    server_errors: Any,
) -> Dict[str, Any]:
    """Map the engine's report.json (+ sidecar files) into the stable shape the
    NestJS backend consumes."""
    pct_raw = str(
        report.get("Percentage of Successfully Processed Operations", "0")
    ).rstrip("%")
    try:
        coverage_pct = float(pct_raw) if pct_raw else 0.0
    except ValueError:
        coverage_pct = 0.0

    summary = {
        "totalOperations": report.get("Number of Total Operations", 0),
        "successfullyProcessed": report.get(
            "Number of Successfully Processed Operations", 0
        ),
        "coveragePct": coverage_pct,
        "totalRequests": report.get("Total Requests Sent", 0),
        "statusCodeDistribution": report.get("Status Code Distribution", {}),
        "uniqueServerErrors": report.get("Number of Unique Server Errors", 0),
        "operationsWithServerErrors": report.get("Operations with Server Errors", 0),
    }
    return {
        "summary": summary,
        "operationStatusCodes": operation_status_codes,
        "serverErrors": server_errors,
        "rawReport": report,
    }


def normalize_endpoint_path(path: str) -> str:
    """Replicates the engine's fallback-operationId path normalization so we can
    reconstruct synthesized ids for operations that lack an operationId."""
    normalized = path.replace("{", "").replace("}", "")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", normalized).strip("_")
    return normalized or "root"


def build_operation_index(spec_text: str) -> Dict[str, Dict[str, str]]:
    """Map each engine operationId -> {method, path} by parsing the spec the
    same way the engine does (operationId when present, else
    `<method>_<normalized-path>`, with duplicate suffixing)."""
    spec = yaml.safe_load(spec_text) or {}
    paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
    index: Dict[str, Dict[str, str]] = {}
    seen: set[str] = set()
    for path, item in paths.items():
        if not isinstance(item, dict):
            continue
        for method, op in item.items():
            ml = method.lower()
            if ml not in _MAPPED_METHODS:
                continue
            provided = op.get("operationId") if isinstance(op, dict) else None
            candidate = provided or f"{ml}_{normalize_endpoint_path(path)}"
            base = candidate
            suffix = 1
            while candidate in seen:
                candidate = f"{base}_{suffix}"
                suffix += 1
            seen.add(candidate)
            index[candidate] = {"method": ml.upper(), "path": path}
    return index


def build_operations(
    operation_status_codes: Any,
    index: Dict[str, Dict[str, str]],
    server_errors: Any,
) -> List[Dict[str, Any]]:
    """Join per-operation status-code counts with method/path so the backend can
    match each to an Endpoint row. `passed` = the operation saw any 2xx."""
    ops: List[Dict[str, Any]] = []
    status_map = operation_status_codes if isinstance(operation_status_codes, dict) else {}
    errors_map = server_errors if isinstance(server_errors, dict) else {}
    for op_id, codes in status_map.items():
        codes = {str(k): v for k, v in codes.items()} if isinstance(codes, dict) else {}
        total = sum(codes.values())
        passed = any(int(c) // 100 == 2 for c in codes)
        meta = index.get(op_id, {})
        ops.append(
            {
                "operationId": op_id,
                "method": meta.get("method"),
                "path": meta.get("path"),
                "statusCodes": codes,
                "totalRequests": total,
                "passed": passed,
                "serverErrors": errors_map.get(op_id, []),
            }
        )
    return ops


def _read_json(path: Path, default: Any) -> Any:
    if path.exists():
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    return default


def collect_outputs(output_dir: Path, spec_text: str) -> Dict[str, Any]:
    """Read the engine's output files from data/<spec-stem>/, normalize, and add
    a per-operation list joined with method/path from the spec."""
    report = _read_json(output_dir / "report.json", {})
    op_status = _read_json(output_dir / "operation_status_codes.json", {})
    server_errors = _read_json(output_dir / "server_errors.json", {})
    result = normalize_report(report, op_status, server_errors)
    index = build_operation_index(spec_text)
    result["operations"] = build_operations(op_status, index, server_errors)
    return result


# --------------------------------------------------------------------------- #
# Execution paths
# --------------------------------------------------------------------------- #
def _mock_report(spec_text: str, time_duration: int) -> Dict[str, Any]:
    """Produce a plausible canned report from the spec so the whole lifecycle
    can be exercised offline without an LLM key."""
    spec = yaml.safe_load(spec_text) or {}
    paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
    methods = {"get", "post", "put", "patch", "delete"}
    total_ops = sum(
        1
        for _p, item in paths.items()
        if isinstance(item, dict)
        for m in item
        if m.lower() in methods
    )
    processed = max(total_ops - 1, 0)
    pct = round(processed / total_ops * 100, 2) if total_ops else 0.0
    return {
        "Title": "AutoRestTest Report (MOCK)",
        "Duration": f"{time_duration} seconds",
        "Total Requests Sent": total_ops * 10,
        "Status Code Distribution": {
            "200": total_ops * 7,
            "404": total_ops * 2,
            "500": total_ops * 1,
        },
        "Number of Total Operations": total_ops,
        "Number of Successfully Processed Operations": processed,
        "Percentage of Successfully Processed Operations": f"{pct}%",
        "Number of Unique Server Errors": total_ops,
        "Operations with Server Errors": total_ops,
    }


def run_mock(output_dir: Path, spec_text: str, time_duration: int) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    time.sleep(0.2)  # simulate a brief run so status transitions are observable

    index = build_operation_index(spec_text)
    op_ids = list(index)
    # Most operations get 2xx traffic (pass); the first one gets only 5xx (no
    # 2xx) so the failure + server-error path is exercised end-to-end.
    op_status = {op_id: {"200": 7, "404": 2} for op_id in op_ids}
    server_errors: Dict[str, Any] = {}
    if op_ids:
        op_status[op_ids[0]] = {"500": 3}
        server_errors[op_ids[0]] = [
            {"status_code": 500, "message": "mock server error"}
        ]

    with (output_dir / "report.json").open("w", encoding="utf-8") as f:
        json.dump(_mock_report(spec_text, time_duration), f, indent=2)
    with (output_dir / "operation_status_codes.json").open("w", encoding="utf-8") as f:
        json.dump(op_status, f)
    with (output_dir / "server_errors.json").open("w", encoding="utf-8") as f:
        json.dump(server_errors, f)


def run_real(
    cfg: Config, spec_path: Path, time_duration: int, toml_text: str
) -> None:
    """Overwrite the core's configurations.toml (restoring it afterwards), then
    shell out to the engine with stdin closed to auto-confirm the prompt."""
    core_toml = cfg.core_dir / "configurations.toml"
    backup = cfg.core_dir / "configurations.toml.engine-service.bak"

    if core_toml.exists():
        shutil.copy2(core_toml, backup)
    core_toml.write_text(toml_text, encoding="utf-8")

    env = _engine_env(cfg)
    cmd = cfg.engine_cmd.split() + [
        "--skip-wizard",
        "-s",
        str(spec_path),
        "-t",
        str(time_duration),
    ]
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cfg.core_dir),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=time_duration + cfg.job_timeout_buffer,
            env=env,
        )
        if result.returncode != 0:
            tail = (result.stderr or result.stdout or "")[-2000:]
            raise RuntimeError(
                f"Engine exited with code {result.returncode}: {tail}"
            )
    finally:
        if backup.exists():
            shutil.move(str(backup), str(core_toml))


def _engine_env(cfg: Config) -> Dict[str, str]:
    import os

    env = os.environ.copy()
    if cfg.api_key:
        env["API_KEY"] = cfg.api_key  # python-dotenv won't override an existing var
    # The engine's Rich TUI prints Unicode symbols (e.g. the info glyph). When run
    # as a captured subprocess on Windows, Python defaults stdout to legacy cp1252
    # and crashes with UnicodeEncodeError. Force UTF-8 I/O so the TUI can render.
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env
