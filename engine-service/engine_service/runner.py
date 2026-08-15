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
import os
import re
import shutil
import signal
import subprocess
import threading
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


def default_auth_header(core_dir: Path) -> Optional[str]:
    """Fallback Authorization header sourced from the core's own `.env`.

    The core CLI applies bearer auth via a `[custom_headers]` section whose
    values interpolate `${VAR}` from `.env`. When run through engine-service the
    config is regenerated from scratch, so that section (and thus the token) is
    dropped unless the caller supplies an explicit header. To match the CLI's
    behaviour, if the core's `.env` defines a non-empty ``JWT_TOKEN`` we emit
    ``"Bearer ${JWT_TOKEN}"`` — a placeholder the engine resolves from its own
    environment at run time, so the raw secret never lands in the generated
    ``configurations.toml``. Returns None when no token is configured.
    """
    env_path = core_dir / ".env"
    if not env_path.exists():
        return None
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == "JWT_TOKEN" and value.strip().strip("\"'"):
                return "Bearer ${JWT_TOKEN}"
    except OSError:
        return None
    return None


def render_config_toml(
    *,
    spec_location: str,
    time_duration: int,
    mutation_rate: float,
    llm_engine: str,
    llm_api_base: str,
    auth_header: Optional[str],
    recursion_limit: int = 50,
    llm_rpm_limit: int = 0,
    value_workers: int = 8,
    use_cache: bool = True,
) -> str:
    """Render a per-run configurations.toml for the engine."""
    doc = tomlkit.document()

    spec = tomlkit.table()
    spec["location"] = spec_location
    # Match the core's default (50). A low limit under-expands nested $ref
    # schemas, producing shallow request bodies (→ 400s) and a weaker
    # dependency graph (→ poor ID reuse → 404s).
    spec["recursion_limit"] = recursion_limit
    spec["strict_validation"] = False
    doc["spec"] = spec

    llm = tomlkit.table()
    llm["engine"] = llm_engine
    llm["creative_temperature"] = 1
    llm["strict_temperature"] = 1
    llm["api_base"] = llm_api_base
    llm["max_tokens"] = 4096
    # Client-side request pacing (0 = disabled). Caps outgoing LLM calls per
    # minute across all threads to respect a provider's rate limit, e.g. 40 for
    # NVIDIA NIM's free tier.
    llm["rpm_limit"] = llm_rpm_limit
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
    # Value-table generation is the un-timed phase that dominates a cold run:
    # two LLM calls per operation, and on a queued free tier each one takes
    # minutes. Concurrency is what makes it bearable — the core's own RPM
    # throttle (llm.rpm_limit above) is what actually protects the provider,
    # so workers can go well past 2 without tripping a rate limit.
    value = tomlkit.table()
    value["parallelize"] = True
    value["max_workers"] = value_workers
    agent["value"] = value
    doc["agent"] = agent

    # Keyed by the spec file's stem, which jobs.py derives from a hash of the
    # spec text. Re-running the same spec then skips graph construction and
    # Q-table initialization outright and goes straight to the timed loop.
    cache = tomlkit.table()
    cache["use_cached_graph"] = use_cache
    cache["use_cached_table"] = use_cache
    doc["cache"] = cache

    # The dependency graph and learned Q-values are what the platform's graph
    # view renders. Written on both the cache-hit and cache-miss paths, so a
    # cached run still produces them.
    export = tomlkit.table()
    export["dependency_graph"] = True
    doc["export"] = export

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
    # The two halves of the dependency graph: `static` is the semantic graph the
    # engine derives from the spec, `learned` the Q-values the MARL loop put on
    # those edges (plus any it discovered at run time). Both default to None
    # rather than {} so a run from an engine predating the export is
    # distinguishable from one that genuinely found no dependencies.
    result["dependencyGraph"] = {
        "static": _read_json(output_dir / "graph.json", None),
        "learned": _read_json(output_dir / "dependency_q_table.json", None),
    }
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


def _mock_dependency_graph(spec_text: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Fabricate a structurally realistic graph + learned table for mock mode.

    Not an imitation of the embedding pass — it just wires each parameterised
    path to the collection it hangs off (`GET /users/{id}` consumes an `id` that
    `GET /users` and `POST /users` produce), which is the shape real specs
    produce anyway. The point is that every edge kind the UI renders —
    predicted, confirmed, penalized, discovered — is present offline, so the
    whole frontend path is exercisable without an LLM key.
    """
    index = build_operation_index(spec_text)

    nodes = []
    for op_id, meta in index.items():
        path = meta["path"] or ""
        params = re.findall(r"\{([^}]+)\}", path)
        nodes.append(
            {
                "operationId": op_id,
                "method": meta["method"],
                "path": meta["path"],
                "summary": None,
                "parameters": [f"{name}|path" for name in params],
                "hasRequestBody": meta["method"] in ("POST", "PUT", "PATCH"),
            }
        )

    edges = []
    for op_id, meta in index.items():
        path = meta["path"] or ""
        params = re.findall(r"\{([^}]+)\}", path)
        if not params:
            continue
        # The collection this item path hangs off, e.g. /users/{id} -> /users
        collection = path.rsplit("/{", 1)[0]
        for other_id, other in index.items():
            if other_id == op_id or other["path"] != collection:
                continue
            edges.append(
                {
                    "consumer": op_id,
                    "producer": other_id,
                    "tentative": False,
                    "maxSimilarity": 1.0,
                    "matches": [
                        {
                            "param": f"{params[0]}|path",
                            "paramIn": "params",
                            "producedBy": params[0],
                            "producedIn": "response",
                            "similarity": 1.0,
                        }
                    ],
                }
            )

    # Give the first few edges learned values so the UI has confirmed (positive)
    # and penalized (negative) edges to draw, and append one edge that is absent
    # from the static graph so the "discovered at runtime" branch renders too.
    table: Dict[str, Any] = {}
    for i, edge in enumerate(edges[:4]):
        match = edge["matches"][0]
        q = round(0.8 - i * 0.35, 2)  # 0.8, 0.45, 0.1, -0.25
        table.setdefault(edge["consumer"], {}).setdefault("params", {}).setdefault(
            match["param"], {}
        ).setdefault(edge["producer"], {}).setdefault(match["producedIn"], {})[
            match["producedBy"]
        ] = q

    static_pairs = {(e["consumer"], e["producer"]) for e in edges}
    discovered = next(
        (
            (consumer, producer)
            for consumer in index
            for producer in index
            if consumer != producer and (consumer, producer) not in static_pairs
        ),
        None,
    )
    if discovered is not None:
        consumer, producer = discovered
        table.setdefault(consumer, {}).setdefault("body", {}).setdefault(
            "mockDiscoveredField", {}
        ).setdefault(producer, {}).setdefault("response", {})["id"] = 0.6

    graph = {"specName": "mock", "nodes": nodes, "edges": edges}
    learned = {"specName": "mock", "dependenciesDiscovered": 1, "table": table}
    return graph, learned


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

    graph, learned = _mock_dependency_graph(spec_text)
    with (output_dir / "graph.json").open("w", encoding="utf-8") as f:
        json.dump(graph, f)
    with (output_dir / "dependency_q_table.json").open("w", encoding="utf-8") as f:
        json.dump(learned, f)


def _kill_tree(proc: "subprocess.Popen[Any]") -> None:
    """Kill the engine *and everything it spawned*.

    `Popen.kill()` only terminates the direct child. `poetry run autoresttest`
    is three processes deep (poetry -> cmd.exe -> launcher -> engine), so
    killing the child leaves the engine orphaned: it keeps hammering the target
    API with nothing watching it, and — because the orphans still hold the
    inherited stdout/stderr handles — anything waiting on those pipes blocks
    forever. On Windows `taskkill /T` walks the tree; elsewhere the child is its
    own process group leader (see `_popen_kwargs`) so the group can be signalled.
    """
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=30,
                check=False,
            )
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        pass
    try:
        proc.wait(timeout=30)
    except Exception:
        proc.kill()


def _popen_kwargs() -> Dict[str, Any]:
    """Put the engine in its own process group/job so the whole tree is killable."""
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


# --------------------------------------------------------------------------- #
# Tying the engine's lifetime to this service's
# --------------------------------------------------------------------------- #
# Runs are serialized (one global configurations.toml), so a single slot holds
# whichever engine is live. `shutdown_active_engine` is what the entry point
# calls on the way out.
_active_lock = threading.Lock()
_active_proc: Optional["subprocess.Popen[Any]"] = None
# Windows job handles, kept alive deliberately: closing the last handle to a
# kill-on-close job is precisely what terminates its processes.
_active_job: Any = None


def _assign_kill_on_close_job(proc: "subprocess.Popen[Any]") -> Any:
    """Tie the engine's lifetime to ours through a Windows Job Object.

    Handlers are not enough on their own. `Stop-Process`, Task Manager and any
    other TerminateProcess caller give this process no chance to run `atexit` or
    a signal handler, and the engine is then orphaned — still running, still
    driving traffic at the target API, with nothing left to reap it. A job object
    with KILL_ON_JOB_CLOSE is enforced by the kernel instead: when our last
    handle to the job goes away — including because we died abruptly — every
    process in the job is terminated with us.

    Returns the job handle, which the caller must keep referenced for as long as
    the engine should live. Best-effort: on failure the engine still runs, it
    just reverts to being orphanable, so this never raises.
    """
    if os.name != "nt":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        JobObjectExtendedLimitInformation = 9

        class BASIC_LIMIT(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_int64),
                ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [(n, ctypes.c_uint64) for n in (
                "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
            )]

        class EXTENDED_LIMIT(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", BASIC_LIMIT),
                ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]

        job = k32.CreateJobObjectW(None, None)
        if not job:
            return None
        info = EXTENDED_LIMIT()
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not k32.SetInformationJobObject(
            job, JobObjectExtendedLimitInformation,
            ctypes.byref(info), ctypes.sizeof(info),
        ):
            return None
        # Grandchildren of a job member join the job automatically, so this one
        # call covers the engine's whole tree.
        if not k32.AssignProcessToJobObject(job, int(proc._handle)):  # type: ignore[attr-defined]
            return None
        return job
    except Exception:
        return None


def shutdown_active_engine() -> None:
    """Kill the running engine, if any. Safe to call when nothing is running."""
    global _active_job
    with _active_lock:
        proc, _active_job = _active_proc, None
    if proc is not None:
        _kill_tree(proc)


def run_real(
    cfg: Config,
    spec_path: Path,
    time_duration: int,
    toml_text: str,
    log_path: Optional[Path] = None,
) -> None:
    """Overwrite the core's configurations.toml (restoring it afterwards), then
    shell out to the engine with stdin closed to auto-confirm the prompt.

    Output goes to `log_path` rather than a pipe. Pipes are what made a timed-out
    run unrecoverable: `subprocess.run` kills the child on timeout and then, on
    Windows, calls `communicate()` with no timeout to drain the pipe — which
    never returns while a surviving grandchild still holds the write handle. A
    file has no such reader, and it also leaves the engine's TUI output on disk
    for debugging, which a captured-then-discarded pipe did not.
    """
    core_toml = cfg.core_dir / "configurations.toml"
    backup = cfg.core_dir / "configurations.toml.engine-service.bak"

    # A backup already on disk is the residue of a run that died before it could
    # restore -- killed engine, killed service, crash. What it holds is the
    # genuine user config, and what `configurations.toml` holds is that dead
    # run's job config. Putting it back before taking a new copy is what stops
    # the job config from being latched in as the "original" for every run
    # afterwards, which is how the checked-in config came to point at a job
    # spec path that no longer exists.
    if backup.exists():
        shutil.move(str(backup), str(core_toml))
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
    timeout = time_duration + cfg.job_timeout_buffer
    log_path = log_path or (spec_path.parent / "stdout.log")

    global _active_proc, _active_job
    try:
        with log_path.open("w", encoding="utf-8", errors="replace") as log:
            proc = subprocess.Popen(
                cmd,
                cwd=str(cfg.core_dir),
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                env=env,
                **_popen_kwargs(),
            )
            with _active_lock:
                _active_proc = proc
                _active_job = _assign_kill_on_close_job(proc)
            try:
                returncode = proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                _kill_tree(proc)
                raise RuntimeError(
                    f"Engine exceeded its {timeout}s budget "
                    f"({time_duration}s time budget + {cfg.job_timeout_buffer}s "
                    f"for the un-timed setup phases) and was terminated. "
                    f"See {log_path.name}."
                ) from None

        if returncode != 0:
            tail = _log_tail(log_path)
            raise RuntimeError(f"Engine exited with code {returncode}: {tail}")
    finally:
        # Releasing the job handle here is what lets the engine outlive nothing:
        # the process has already exited by this point, so closing it is a no-op
        # rather than a kill.
        with _active_lock:
            _active_proc = None
            _active_job = None
        if backup.exists():
            shutil.move(str(backup), str(core_toml))


_ANSI = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]")
# Rich redraws its progress panels continuously, so the raw tail of a log is
# almost entirely box-drawing. Those frames are what an error message must not
# be made of: they crowd out the actual cause and are what the user ends up
# reading in the UI.
_TUI_FRAME = re.compile(r"^[\s│┃╭╮╰╯┌┐└┘├┤┬┴┼─━╌┄┈▁▂▃▄▅▆▇█▏▎▍▌▋▊▉]*$")


def _log_tail(log_path: Path, limit: int = 2000) -> str:
    """Last `limit` characters of real output, with the TUI chrome removed."""
    try:
        raw = log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return "(no output captured)"

    lines: List[str] = []
    seen: set[str] = set()
    for line in _ANSI.sub("", raw).splitlines():
        # Strip the panel borders as well as whitespace, so a heading is
        # compared on its text rather than on the box drawn around it.
        stripped = line.strip().strip("│┃╎┆║").strip()
        if not stripped or _TUI_FRAME.match(stripped):
            continue
        # Global, not consecutive: a live panel cycles through a handful of
        # distinct lines, so only deduplicating neighbours leaves the tail full
        # of the same four rows. Keeping first occurrences preserves order and
        # pushes the repeated chrome up out of the tail window.
        if stripped in seen:
            continue
        seen.add(stripped)
        lines.append(stripped)

    tail = "\n".join(lines)[-limit:]
    return tail or "(no output captured)"


def _engine_env(cfg: Config) -> Dict[str, str]:
    env = os.environ.copy()
    if cfg.api_key:
        env["API_KEY"] = cfg.api_key  # python-dotenv won't override an existing var
    # The engine's Rich TUI prints Unicode symbols (e.g. the info glyph). When run
    # as a captured subprocess on Windows, Python defaults stdout to legacy cp1252
    # and crashes with UnicodeEncodeError. Force UTF-8 I/O so the TUI can render.
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    # stdout is a file here, not a terminal, so Python block-buffers it and the
    # log stays empty for the entire run -- exactly when it is most wanted.
    env["PYTHONUNBUFFERED"] = "1"
    return env
