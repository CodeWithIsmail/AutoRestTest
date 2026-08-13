"""Bridge between engine-service and the OOPS spec-generation pipeline.

This script is NOT imported by the Flask service. It is spawned as a subprocess
by ``engine_service.oops_runner`` using OOPS's own interpreter
(``OOPS-core/.venv``), because OOPS requires Python >= 3.12 while
autoresttest-core — and possibly this service — run on older interpreters.

It is therefore the single point of contact with ``core.*``, which is what lets
OOPS-core stay an unmodified vendored research tool. Only the standard library
and OOPS's own dependencies may be imported here.

Usage:  python oops_worker.py <job-dir>

<job-dir> must contain params.json:
    {
      "title": "My API", "version": "1.0.0",
      "sourceDir": "<abs path to the extracted codebase>",
      "ignorePath": ["node_modules", ...], "ignoreSufx": ["env", ...]
    }

Outputs written into <job-dir>:
    progress.json   after every pipeline step
    openapi.json    the generated OAS 3.x document (success)
    swagger2.json   the accumulated Swagger 2.0 payload (upgrade-step fallback)
    error.txt       traceback, when nothing usable was produced

Exit codes:  0 = openapi.json written, 2 = swagger2.json fallback, 1 = failed.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

# The pipeline renders dependency-graph PNGs after every step. Without a
# non-interactive backend that call can try to open a GUI window from a
# subprocess with no display and hang the whole run.
os.environ.setdefault("MPLBACKEND", "Agg")

# core.* is absolute-imported throughout OOPS, and the vendored swagger-codegen
# jar is resolved relative to the package, so the project root has to be both on
# sys.path and the working directory.
_OOPS_DIR = Path(__file__).resolve().parent.parent / "OOPS-core"
_OOPS_DIR = Path(os.environ.get("OOPS_DIR", _OOPS_DIR)).resolve()
sys.path.insert(0, str(_OOPS_DIR))
os.chdir(_OOPS_DIR)

# OOPS ships with LLM_RATE_LIMIT_RPM = 120, sized for a paid endpoint. On a
# free tier that allows ~40 rpm the pipeline burns through the window in about
# 30 seconds, and the 429s it then collects each trigger a retry that spends
# more of the same budget — a feedback loop that took down step one of the
# pipeline before it produced a single result.
#
# The limit has to be overridden *before* core.shared.llm_factory is imported,
# because its shared RateLimiter is built at class-definition time. Patching
# core.constants here means every module that later does
# `from core.constants import *` picks up the new value, which keeps OOPS-core
# itself unmodified. core/__init__.py only prints a banner, so importing
# core.constants triggers nothing else.
import core.constants  # noqa: E402  (must follow the sys.path setup)

core.constants.LLM_RATE_LIMIT_RPM = int(os.environ.get("OOPS_RPM_LIMIT", "35"))
core.constants.LLM_BATCH_SEMAPHORE = int(
    os.environ.get("OOPS_BATCH_SEMAPHORE", core.constants.LLM_BATCH_SEMAPHORE)
)

from core.pipeline import MainPipeline  # noqa: E402  (must follow the patch above)
from core.shared import LLMFactory  # noqa: E402

# nemotron reasons before answering and the reasoning comes out of the completion
# budget, which starves short extractions. Disabling it is what makes the
# pipeline usable — see the measurements in OOPS-core/run_careerstory.py.
NO_THINKING = {"chat_template_kwargs": {"thinking": False}}

# The swagger-generation stage emits a full request/response schema per operation
# (6k+ tokens) and does not fit the 3-minute default: at that timeout it loses
# most of its operations to "Request timed out".
SWAGGER_STAGE_TIMEOUT = 10 * 60

# Ordered pipeline steps, mirroring MainPipeline.run's `nexts` table. Used to
# turn a step name into "step N of 9" progress for the UI.
STEPS: list[tuple[str, str]] = [
    ("pre_technology_analyze", "Detecting language and framework"),
    ("run_api_entry_detection", "Finding API entry points"),
    ("add_dependency_graph_node", "Building the dependency graph"),
    ("run_file_dependency_analyze", "Resolving file dependencies"),
    ("add_dependency_graph_edge", "Linking the dependency graph"),
    ("run_endpoint_method_extract", "Extracting endpoints and methods"),
    ("add_openapi_operation", "Assembling operations"),
    ("run_swagger_generation", "Generating request/response schemas"),
    ("add_swagger_component", "Finalising the specification"),
]

_STEP_INDEX = {name: i + 1 for i, (name, _) in enumerate(STEPS)}
_STEP_LABEL = {name: label for name, label in STEPS}

# The Swagger 2.0 fallback is only meaningful once the builder has actually been
# populated, which happens in the final step. Failing earlier than this means
# there is nothing worth salvaging.
_LAST_STEP = STEPS[-1][0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_json(path: Path, payload: object) -> None:
    # Write-then-rename so a reader polling this file never observes a partial
    # document (the service reads progress.json on an unrelated schedule).
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, ensure_ascii=False)
    tmp.replace(path)


def _count_operations(document: dict) -> int:
    methods = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
    paths = document.get("paths") or {}
    if not isinstance(paths, dict):
        return 0
    return sum(
        1
        for item in paths.values()
        if isinstance(item, dict)
        for key in item
        if key.lower() in methods
    )


async def main() -> int:
    job_dir = Path(sys.argv[1]).resolve()
    params = json.loads((job_dir / "params.json").read_text(encoding="utf-8"))

    progress_path = job_dir / "progress.json"
    model = os.environ.get("OOPS_MODEL", "nvidia/nemotron-3-nano-30b-a3b")

    # LLMFactory asserts on empty credentials deep inside its constructor; check
    # here so a misconfigured service reports the cause instead of an
    # AssertionError with no context.
    if not os.environ.get("LLM_API_KEY") or not os.environ.get("LLM_API_URL"):
        (job_dir / "error.txt").write_text(
            "LLM_API_KEY and LLM_API_URL must be set for spec generation "
            "(engine-service supplies these from API_KEY and LLM_API_BASE).",
            encoding="utf-8",
        )
        return 1

    def progress(step: str, done: bool = False) -> None:
        _write_json(
            progress_path,
            {
                "step": step,
                "stepLabel": _STEP_LABEL.get(step, step),
                "stepIndex": len(STEPS) if done else _STEP_INDEX.get(step, 0),
                "stepTotal": len(STEPS),
                "at": _now(),
            },
        )

    # Publish the first step before any LLM call, so the UI shows real progress
    # during the (slow) technology-analysis stage rather than an empty state.
    progress(STEPS[0][0])

    log_base = str(job_dir / "oops-log")

    pipeline = MainPipeline(
        title=params.get("title") or "Generated API",
        version=params.get("version") or "1.0.0",
        project=params["sourceDir"],
        # The reference runners use relative log/ and run/ paths, which resolve
        # against OOPS-core. Keep every artifact inside the job directory so a
        # generation leaves no trace in the vendored project.
        log_base=log_base,
        upg_base=log_base,
        config=MainPipeline.Config(
            default_llm_worker_client=LLMFactory(model, extra_body=NO_THINKING),
            default_llm_parser_client=LLMFactory(model, extra_body=NO_THINKING),
            swagger_generation_worker_client=LLMFactory(
                model, extra_body=NO_THINKING, timeout=SWAGGER_STAGE_TIMEOUT
            ),
            swagger_generation_parser_client=LLMFactory(
                model, extra_body=NO_THINKING, timeout=SWAGGER_STAGE_TIMEOUT
            ),
            ignore_sufx=params.get("ignoreSufx") or ["env"],
            ignore_path=params.get("ignorePath") or [],
        ),
    )

    reached_last_step = False

    def on_complete(_context: MainPipeline, done: str, nxt: str) -> None:
        nonlocal reached_last_step
        if done == _LAST_STEP:
            reached_last_step = True
        print(f"[oops] finished {done} -> {nxt}", flush=True)
        progress(nxt if nxt in _STEP_INDEX else done, done=nxt not in _STEP_INDEX)

    try:
        oas = await pipeline.run(on_complete=on_complete)
        _write_json(
            job_dir / "openapi.json",
            json.loads(oas.model_dump_json(exclude_unset=True, by_alias=True)),
        )
        progress(_LAST_STEP, done=True)
        print("[oops] wrote openapi.json", flush=True)
        return 0

    except Exception:  # pylint: disable=broad-exception-caught
        traceback.print_exc()
        (job_dir / "error.txt").write_text(traceback.format_exc(), encoding="utf-8")

        # run() only reaches upgrade_apidoc (a `java -jar` shell-out) after every
        # expensive LLM call is already paid for. If that or rebuild_apidoc is
        # what failed, the accumulated Swagger 2.0 document is still complete and
        # the caller can convert it — losing it would be the worst possible trade.
        # Anything that failed earlier has nothing worth salvaging.
        if not reached_last_step:
            return 1

        builder = getattr(pipeline, "_MainPipeline__oas_builder")
        payload = getattr(builder, "_OASBuilder__payload")
        if not _count_operations(payload):
            return 1

        _write_json(job_dir / "swagger2.json", payload)
        progress(_LAST_STEP, done=True)
        print("[oops] oas upgrade failed; wrote the swagger 2.0 fallback", flush=True)
        return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
