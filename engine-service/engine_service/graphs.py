"""Standalone dependency-graph builds.

A test run already emits its dependency graph as a side effect, but the platform
also wants the graph for a project that has never been run — right after a spec
is uploaded. That is what this manager provides: spec in, graph JSON out, no
target API and no LLM involved.

Kept apart from `JobManager` deliberately. Test runs are serialized because the
engine reads one global `configurations.toml`, and a run can occupy that queue
for hours; a graph build takes seconds and must not sit behind one. Same reason
`GenerationManager` has its own queue, and this follows its shape closely.
"""

from __future__ import annotations

import json
import queue
import shutil
import subprocess
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .config import Config
from .runner import _engine_env

_SERVICE_ROOT = Path(__file__).resolve().parent.parent
GRAPH_WORKER = _SERVICE_ROOT / "graph_worker.py"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class GraphJob:
    id: str
    status: str = "pending"  # pending | running | completed | failed
    error: Optional[str] = None
    created_at: str = field(default_factory=_now)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def public(self) -> Dict[str, Any]:
        d = asdict(self)
        return {
            "jobId": d["id"],
            "status": d["status"],
            "error": d["error"],
            "createdAt": d["created_at"],
            "startedAt": d["started_at"],
            "completedAt": d["completed_at"],
        }


class GraphManager:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._jobs: Dict[str, GraphJob] = {}
        self._specs: Dict[str, str] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[str]" = queue.Queue()
        cfg.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._worker = threading.Thread(
            target=self._run_worker, name="graph-worker", daemon=True
        )
        self._worker.start()

    # -- public API --------------------------------------------------------- #
    def submit(self, spec_text: str) -> GraphJob:
        job = GraphJob(id=uuid.uuid4().hex)
        with self._lock:
            self._jobs[job.id] = job
            self._specs[job.id] = spec_text
        self._persist(job)
        self._queue.put(job.id)
        return job

    def get(self, job_id: str) -> Optional[GraphJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def result(self, job_id: str) -> Optional[Dict[str, Any]]:
        path = self._job_dir(job_id) / "graph.json"
        if not path.exists():
            return None
        try:
            with path.open(encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None

    def delete(self, job_id: str) -> bool:
        with self._lock:
            existed = self._jobs.pop(job_id, None) is not None
            self._specs.pop(job_id, None)
        job_dir = self._job_dir(job_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        return existed

    # -- worker ------------------------------------------------------------- #
    def _run_worker(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                self._execute(job_id)
            except Exception as exc:  # noqa: BLE001 - record and keep serving
                self._fail(job_id, str(exc))
            finally:
                self._queue.task_done()

    def _execute(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            spec_text = self._specs.pop(job_id, None)
        if job is None or spec_text is None:
            return  # deleted before it ran

        self._transition(job, status="running", started_at=_now())
        job_dir = self._job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        out_path = job_dir / "graph.json"

        if self.cfg.is_mock:
            from .runner import _mock_dependency_graph

            graph, _learned = _mock_dependency_graph(spec_text)
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(graph, f)
            self._transition(job, status="completed", completed_at=_now())
            return

        if not self.cfg.engine_python:
            raise RuntimeError(
                "No interpreter configured for graph builds. Set ENGINE_PYTHON to "
                "the engine venv's python (ENGINE_CMD is not one)."
            )

        # A stable, content-independent name is fine here: nothing caches on it,
        # and the file lives in the job directory rather than the engine's
        # shared data/ tree.
        spec_path = job_dir / "spec.yaml"
        spec_path.write_text(spec_text, encoding="utf-8")

        log_path = job_dir / "stdout.log"
        with log_path.open("w", encoding="utf-8", errors="replace") as log:
            proc = subprocess.run(
                [self.cfg.engine_python, str(GRAPH_WORKER), str(spec_path), str(out_path)],
                cwd=str(self.cfg.core_dir),
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                env=_engine_env(self.cfg),
                timeout=self.cfg.graph_timeout,
                check=False,
            )

        if proc.returncode != 0:
            raise RuntimeError(self._failure_message(log_path, proc.returncode))
        if not out_path.exists():
            raise RuntimeError("Graph build reported success but produced no output")

        self._transition(job, status="completed", completed_at=_now())

    def _failure_message(self, log_path: Path, code: int) -> str:
        detail = ""
        if log_path.exists():
            detail = log_path.read_text(encoding="utf-8", errors="replace").strip()[-1000:]
        return f"Graph build exited with code {code}" + (f": {detail}" if detail else "")

    # -- state -------------------------------------------------------------- #
    def _fail(self, job_id: str, message: str) -> None:
        job = self.get(job_id)
        if job is None:
            return
        self._transition(job, status="failed", error=message, completed_at=_now())

    def _transition(self, job: GraphJob, **changes: Any) -> None:
        with self._lock:
            for key, value in changes.items():
                setattr(job, key, value)
        self._persist(job)

    def _job_dir(self, job_id: str) -> Path:
        return self.cfg.jobs_dir / job_id

    def _persist(self, job: GraphJob) -> None:
        job_dir = self._job_dir(job.id)
        job_dir.mkdir(parents=True, exist_ok=True)
        with (job_dir / "status.json").open("w", encoding="utf-8") as f:
            json.dump(job.public(), f, indent=2)
