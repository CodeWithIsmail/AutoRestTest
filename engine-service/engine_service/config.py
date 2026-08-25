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


def _interpreter_path(raw: str | Path) -> Path:
    """Absolute path to an interpreter, WITHOUT resolving its final symlink.

    Never use ``Path.resolve()`` on an interpreter. On POSIX a virtualenv's
    ``bin/python`` is a symlink to the base interpreter (``/usr/local/bin/
    python3``), and CPython decides whether it is running inside a venv from
    the path it was *invoked* as -- ``sys.executable``'s own directory is where
    it looks for ``pyvenv.cfg``. Resolve the symlink and you launch the base
    interpreter directly: it starts fine, but sees none of the venv's
    site-packages, so every OOPS dependency import fails with a bare
    ``ModuleNotFoundError`` that looks like a broken install rather than the
    wrong interpreter.

    This only ever broke in the Linux container: Windows venvs copy
    ``python.exe`` instead of symlinking it, so ``resolve()`` was a no-op in
    local development.

    ``os.path.abspath`` gives absoluteness and lexical ``..`` normalization --
    the parts ``resolve()`` was wanted for -- while leaving the symlink itself
    intact.
    """
    return Path(os.path.abspath(os.path.expanduser(str(raw))))


def _default_engine_python() -> str:
    """Interpreter used to run graph_worker.py under the engine's environment.

    ENGINE_CMD is a whole command line, so its first token is the interpreter in
    the recommended `<venv>/python -m autoresttest.autoresttest` form. That is
    the right default: a graph build has to import autoresttest, so it must use
    the same environment the engine does. When ENGINE_CMD is a wrapper instead
    (`poetry run autoresttest`) the first token is not an interpreter, and
    ENGINE_PYTHON has to be set explicitly.
    """
    explicit = os.environ.get("ENGINE_PYTHON", "").strip()
    if explicit:
        return explicit
    first = os.environ.get("ENGINE_CMD", "").strip().split(" ")[0]
    return first if "python" in first.lower() else ""


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
    engine_value_workers: int
    engine_use_cache: bool
    engine_python: str
    graph_timeout: int
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
    oops_api_key: str
    oops_llm_api_url: str

    @classmethod
    def from_env(cls) -> "Config":
        core_dir = Path(
            os.environ.get("CORE_DIR", _SERVICE_ROOT.parent / "autoresttest-core")
        ).resolve()
        jobs_dir = Path(os.environ.get("JOBS_DIR", _SERVICE_ROOT / "jobs")).resolve()
        oops_dir = Path(
            os.environ.get("OOPS_DIR", _SERVICE_ROOT.parent / "OOPS-final")
        ).resolve()
        oops_python = _interpreter_path(
            os.environ.get("OOPS_PYTHON", _default_oops_python(oops_dir))
        )
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
            # Value-agent concurrency. The un-timed Q-table phase makes two LLM
            # calls per operation, so this is the biggest lever on how long a run
            # takes to start testing -- but only up to a point. NVIDIA NIM's free
            # tier was measured returning 429s and 500s at 8 workers even well
            # under its 40 RPM limit, because the ceiling it enforces is on
            # *concurrent* requests, which LLM_RPM_LIMIT does nothing about. A
            # failed call yields an empty value table, so over-parallelizing buys
            # speed with test quality. Raise this only against a paid endpoint.
            engine_value_workers=int(os.environ.get("ENGINE_VALUE_WORKERS", "3")),
            # Reuse the cached dependency graph and Q-tables when the same spec
            # is run again, skipping the un-timed phases entirely. Requires the
            # stable, content-derived spec name assigned in jobs.py.
            engine_use_cache=_bool("ENGINE_USE_CACHE", True),
            # Interpreter for graph_worker.py, which builds a dependency graph
            # without running a test. Defaults to the first token of ENGINE_CMD,
            # which is already the engine venv's python in the recommended
            # `<venv>/python -m autoresttest.autoresttest` form; set it explicitly
            # if ENGINE_CMD is a wrapper such as `poetry run autoresttest`.
            engine_python=_default_engine_python(),
            # Graph construction is embedding-based, not LLM-based: seconds of
            # work behind a one-off gensim model load. Generous enough for a cold
            # model load on a slow disk, far below a test run's budget.
            graph_timeout=int(os.environ.get("GRAPH_TIMEOUT", "900")),
            oops_dir=oops_dir,
            oops_python=oops_python,
            # OOPS-final targets Gemini 3.5 Flash Lite via its OpenAI-compatible
            # endpoint -- measured at 15-20 min end-to-end, versus 1h+ on the
            # NVIDIA NIM nemotron setup the previous OOPS-core integration used.
            oops_model=os.environ.get("OOPS_MODEL", "gemini-3.5-flash-lite"),
            # Generation is LLM-bound; sized with headroom over the ~15-20 min
            # measured runtime rather than the multi-hour ceiling the slower
            # nemotron setup needed.
            oops_timeout=int(os.environ.get("OOPS_TIMEOUT", str(40 * 60))),
            # Gemini's free tier allows 15 rpm; kept just under it with headroom,
            # matching OOPS-final/main.py's own sample configuration. Raise it
            # only against a paid endpoint.
            oops_rpm_limit=int(os.environ.get("OOPS_RPM_LIMIT", "12")),
            # Matches OOPS-final's own built-in LLM_BATCH_SEMAPHORE default, so
            # leaving this unset is a no-op rather than silently throttling it.
            oops_batch_semaphore=int(os.environ.get("OOPS_BATCH_SEMAPHORE", "16")),
            oops_max_zip_bytes=int(
                os.environ.get("OOPS_MAX_ZIP_BYTES", str(50 * 1024 * 1024))
            ),
            oops_max_source_bytes=int(
                os.environ.get("OOPS_MAX_SOURCE_BYTES", str(200 * 1024 * 1024))
            ),
            oops_max_files=int(os.environ.get("OOPS_MAX_FILES", "5000")),
            # Dedicated to spec generation, independent of the main engine's
            # API_KEY/LLM_API_BASE above -- OOPS can run against a different
            # provider (Gemini) than whatever the test-generation engine uses.
            oops_api_key=os.environ.get("OOPS_API_KEY", ""),
            oops_llm_api_url=os.environ.get(
                "OOPS_LLM_API_URL",
                "https://generativelanguage.googleapis.com/v1beta/openai/",
            ),
        )

    @property
    def is_mock(self) -> bool:
        return self.engine_mode == "mock"
