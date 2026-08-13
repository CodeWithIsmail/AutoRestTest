"""Environment-driven configuration for the engine-service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_SERVICE_ROOT = Path(__file__).resolve().parent.parent  # engine-service/

# Load engine-service/.env so ENGINE_MODE, LLM_ENGINE, API_KEY, etc. can be set
# there permanently instead of exported in the shell on every launch. Real
# environment variables take precedence (override=False), so shell/CI overrides
# still win. Loaded at import time, before any Config.from_env() reads os.environ.
load_dotenv(_SERVICE_ROOT / ".env")


def _bool(env: str, default: bool) -> bool:
    raw = os.environ.get(env)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _default_oops_python(oops_dir: Path) -> Path:
    """Interpreter for the OOPS venv. OOPS needs Python >= 3.12 while
    autoresttest-core is on 3.10, so spec generation always runs in its own
    virtualenv rather than whichever interpreter serves this process."""
    if os.name == "nt":
        return oops_dir / ".venv" / "Scripts" / "python.exe"
    return oops_dir / ".venv" / "bin" / "python"


@dataclass(frozen=True)
class Config:
    core_dir: Path
    jobs_dir: Path
    engine_mode: str  # "mock" | "real"
    engine_cmd: str
    api_key: str
    llm_engine: str
    llm_api_base: str
    llm_rpm_limit: int
    service_token: str
    port: int
    job_timeout_buffer: int
    # -- OOPS spec generation (codebase -> OpenAPI) ------------------------- #
    oops_dir: Path
    oops_python: Path
    oops_model: str
    oops_timeout: int
    oops_rpm_limit: int
    oops_batch_semaphore: int
    oops_max_zip_bytes: int
    oops_max_source_bytes: int
    oops_max_files: int

    @classmethod
    def from_env(cls) -> "Config":
        core_dir = Path(
            os.environ.get("CORE_DIR", _SERVICE_ROOT.parent / "autoresttest-core")
        ).resolve()
        jobs_dir = Path(os.environ.get("JOBS_DIR", _SERVICE_ROOT / "jobs")).resolve()
        oops_dir = Path(
            os.environ.get("OOPS_DIR", _SERVICE_ROOT.parent / "OOPS-core")
        ).resolve()
        oops_python = Path(
            os.environ.get("OOPS_PYTHON", _default_oops_python(oops_dir))
        ).resolve()
        return cls(
            core_dir=core_dir,
            jobs_dir=jobs_dir,
            engine_mode=os.environ.get("ENGINE_MODE", "real").strip().lower(),
            engine_cmd=os.environ.get("ENGINE_CMD", "poetry run autoresttest"),
            api_key=os.environ.get("API_KEY", ""),
            llm_engine=os.environ.get("LLM_ENGINE", "google/gemini-2.5-flash-lite"),
            llm_api_base=os.environ.get(
                "LLM_API_BASE", "https://openrouter.ai/api/v1"
            ),
            llm_rpm_limit=int(os.environ.get("LLM_RPM_LIMIT", "0")),
            service_token=os.environ.get("SERVICE_TOKEN", ""),
            port=int(os.environ.get("PORT", "5000")),
            job_timeout_buffer=int(os.environ.get("JOB_TIMEOUT_BUFFER", "1800")),
            oops_dir=oops_dir,
            oops_python=oops_python,
            # Measured on the NVIDIA NIM free tier in OOPS-core/run_careerstory.py:
            # the llama deployments are degraded and the larger nemotron earns an
            # account-level cooldown, so nemotron-nano is the one that finishes.
            oops_model=os.environ.get("OOPS_MODEL", "nvidia/nemotron-3-nano-30b-a3b"),
            # Generation is LLM-bound and runs for hours on a mid-size backend.
            oops_timeout=int(os.environ.get("OOPS_TIMEOUT", str(4 * 60 * 60))),
            # OOPS defaults to 120 rpm, which is ~3x the NVIDIA free tier and
            # collapses into a 429 retry storm. Kept just under the ~40 rpm
            # ceiling; raise it only against a paid endpoint.
            oops_rpm_limit=int(os.environ.get("OOPS_RPM_LIMIT", "35")),
            oops_batch_semaphore=int(os.environ.get("OOPS_BATCH_SEMAPHORE", "3")),
            oops_max_zip_bytes=int(
                os.environ.get("OOPS_MAX_ZIP_BYTES", str(50 * 1024 * 1024))
            ),
            oops_max_source_bytes=int(
                os.environ.get("OOPS_MAX_SOURCE_BYTES", str(200 * 1024 * 1024))
            ),
            oops_max_files=int(os.environ.get("OOPS_MAX_FILES", "5000")),
        )

    @property
    def is_mock(self) -> bool:
        return self.engine_mode == "mock"
