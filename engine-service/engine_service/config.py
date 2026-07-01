"""Environment-driven configuration for the engine-service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_SERVICE_ROOT = Path(__file__).resolve().parent.parent  # engine-service/


def _bool(env: str, default: bool) -> bool:
    raw = os.environ.get(env)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Config:
    core_dir: Path
    jobs_dir: Path
    engine_mode: str  # "mock" | "real"
    engine_cmd: str
    api_key: str
    llm_engine: str
    llm_api_base: str
    service_token: str
    port: int
    job_timeout_buffer: int

    @classmethod
    def from_env(cls) -> "Config":
        core_dir = Path(
            os.environ.get("CORE_DIR", _SERVICE_ROOT.parent / "autoresttest-core")
        ).resolve()
        jobs_dir = Path(os.environ.get("JOBS_DIR", _SERVICE_ROOT / "jobs")).resolve()
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
            service_token=os.environ.get("SERVICE_TOKEN", ""),
            port=int(os.environ.get("PORT", "5000")),
            job_timeout_buffer=int(os.environ.get("JOB_TIMEOUT_BUFFER", "1800")),
        )

    @property
    def is_mock(self) -> bool:
        return self.engine_mode == "mock"
