"""Subprocess invocation for the OOPS spec-generation pipeline.

Mirrors ``runner.run_real`` in shape, with two deliberate differences:

* the command is ``<OOPS venv python> oops_worker.py <job-dir>`` rather than a
  console script, because OOPS ships no CLI entry point; and
* output is streamed to a file instead of captured in memory, so a run that
  lasts hours can be watched with ``tail -f jobs/<id>/stdout.log`` while it is
  still in flight.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Dict, Optional

from .config import Config

_SERVICE_ROOT = Path(__file__).resolve().parent.parent

# oops_worker.py exit codes.
EXIT_OK = 0
EXIT_FAILED = 1
EXIT_SWAGGER2_FALLBACK = 2


def java_available() -> bool:
    """Whether a JRE is on PATH.

    OOPS upgrades its Swagger 2.0 output to OAS 3.x by shelling out to
    ``java -jar codegen-3.0.68.jar``. Without a JRE that step fails and the run
    falls back to the raw Swagger 2.0 payload, which the backend has to convert
    itself at lower fidelity. Surfaced as a job warning rather than a hard
    failure so the run still produces a usable spec.
    """
    try:
        subprocess.run(
            ["java", "-version"],
            capture_output=True,
            timeout=15,
            check=False,
        )
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def oops_env(
    cfg: Config,
    *,
    oops_model: Optional[str] = None,
    oops_api_base: Optional[str] = None,
    oops_rpm_limit: Optional[int] = None,
    oops_api_key: Optional[str] = None,
) -> Dict[str, str]:
    """Environment for the worker subprocess.

    Generation uses its own dedicated LLM credentials (``OOPS_API_KEY`` /
    ``OOPS_LLM_API_URL``), exported under the names OOPS reads (``LLM_API_KEY``
    / ``LLM_API_URL``). These are deliberately separate from the main engine's
    ``API_KEY`` / ``LLM_API_BASE`` so spec generation can run against a
    different provider (e.g. Gemini) than whatever the test-generation engine
    uses. The vendored project's own ``.env`` is never consulted.

    ``oops_model``/``oops_api_base``/``oops_rpm_limit``/``oops_api_key`` are
    optional per-request overrides (from the NestJS backend's
    admin-configurable SPEC_GENERATION settings); when absent,
    ``cfg.oops_model``/``cfg.oops_llm_api_url``/``cfg.oops_rpm_limit``/
    ``cfg.oops_api_key`` (this service's own env vars) are used, exactly as
    before this override existed.
    """
    env = os.environ.copy()
    resolved_api_key = oops_api_key or cfg.oops_api_key
    if resolved_api_key:
        env["LLM_API_KEY"] = resolved_api_key
    env["LLM_API_URL"] = oops_api_base or cfg.oops_llm_api_url
    env["OOPS_MODEL"] = oops_model or cfg.oops_model
    env["OOPS_DIR"] = str(cfg.oops_dir)
    # Read by oops_worker.py to override OOPS's built-in pacing before the
    # pipeline is imported; see the comment there.
    env["OOPS_RPM_LIMIT"] = str(oops_rpm_limit or cfg.oops_rpm_limit)
    env["OOPS_BATCH_SEMAPHORE"] = str(cfg.oops_batch_semaphore)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    # The pipeline renders dependency-graph PNGs after every step; a headless
    # subprocess must not reach for an interactive backend.
    env["MPLBACKEND"] = "Agg"
    return env


def run_oops(
    cfg: Config,
    job_dir: Path,
    *,
    oops_model: Optional[str] = None,
    oops_api_base: Optional[str] = None,
    oops_rpm_limit: Optional[int] = None,
    oops_api_key: Optional[str] = None,
) -> int:
    """Run the generation pipeline for a prepared job directory.

    Returns the worker's exit code (see the EXIT_* constants). Raises only when
    the subprocess could not be started or outlived ``OOPS_TIMEOUT``.
    """
    worker = _SERVICE_ROOT / "oops_worker.py"
    if not cfg.oops_python.exists():
        raise RuntimeError(
            f"OOPS interpreter not found at {cfg.oops_python}. "
            f"Run `uv sync` in {cfg.oops_dir}, or set OOPS_PYTHON."
        )
    if not worker.exists():
        raise RuntimeError(f"oops_worker.py not found at {worker}")

    log_path = job_dir / "stdout.log"
    cmd = [str(cfg.oops_python), str(worker), str(job_dir)]

    with log_path.open("w", encoding="utf-8", errors="replace") as log:
        process = subprocess.Popen(
            cmd,
            cwd=str(cfg.oops_dir),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            env=oops_env(
                cfg,
                oops_model=oops_model,
                oops_api_base=oops_api_base,
                oops_rpm_limit=oops_rpm_limit,
                oops_api_key=oops_api_key,
            ),
        )
        try:
            return process.wait(timeout=cfg.oops_timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=30)
            raise RuntimeError(
                f"Spec generation exceeded its {cfg.oops_timeout}s limit and was "
                "stopped. Try a smaller codebase or raise OOPS_TIMEOUT."
            ) from None
