"""Async job management: an in-memory registry plus a single background worker
that processes runs one at a time (the engine reads a single global
configurations.toml, so runs must be serialized)."""

from __future__ import annotations

import json
import os
import queue
import shutil
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .config import Config
from . import runner


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Job:
    id: str
    status: str = "pending"  # pending | running | completed | failed
    target_url: str = ""
    time_budget: int = 0
    error: Optional[str] = None
    created_at: str = field(default_factory=_now)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def public(self) -> Dict[str, Any]:
        d = asdict(self)
        return {
            "jobId": d["id"],
            "status": d["status"],
            "targetUrl": d["target_url"],
            "timeBudget": d["time_budget"],
            "error": d["error"],
            "createdAt": d["created_at"],
            "startedAt": d["started_at"],
            "completedAt": d["completed_at"],
        }


class JobManager:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._jobs: Dict[str, Job] = {}
        self._params: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[str]" = queue.Queue()
        cfg.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._worker = threading.Thread(
            target=self._run_worker, name="engine-worker", daemon=True
        )
        self._worker.start()

    # -- public API --------------------------------------------------------- #
    def submit(self, params: Dict[str, Any]) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            target_url=params["targetUrl"],
            time_budget=int(params["timeBudget"]),
        )
        with self._lock:
            self._jobs[job.id] = job
            self._params[job.id] = params
        self._persist(job)
        self._queue.put(job.id)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def result(self, job_id: str) -> Optional[Dict[str, Any]]:
        path = self._job_dir(job_id) / "result.json"
        if not path.exists():
            return None
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def delete(self, job_id: str) -> bool:
        with self._lock:
            existed = self._jobs.pop(job_id, None) is not None
            self._params.pop(job_id, None)
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
            params = self._params.get(job_id)
        if job is None or params is None:
            return  # deleted before it ran

        self._transition(job, status="running", started_at=_now())

        spec_name = f"job_{job_id[:12]}"
        job_dir = self._job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        runner.validate_target_url(params["targetUrl"])
        spec_text = runner.inject_target_url(params["spec"], params["targetUrl"])
        spec_path = job_dir / f"{spec_name}.yaml"
        spec_path.write_text(spec_text, encoding="utf-8")

        time_budget = int(params["timeBudget"])
        output_dir = self.cfg.core_dir / "data" / spec_name

        if self.cfg.is_mock:
            runner.run_mock(output_dir, spec_text, time_budget)
        else:
            toml_text = runner.render_config_toml(
                spec_location=str(spec_path),
                time_duration=time_budget,
                mutation_rate=float(params.get("mutationRate", 0.2)),
                llm_engine=params.get("llmEngine") or self.cfg.llm_engine,
                llm_api_base=self.cfg.llm_api_base,
                # Per-run authHeader wins; otherwise fall back to a service-wide
                # TEST_AUTH_HEADER env var (temporary shortcut for testing auth'd
                # endpoints before the per-suite auth field is built).
                auth_header=params.get("authHeader") or os.getenv("TEST_AUTH_HEADER"),
            )
            runner.run_real(self.cfg, spec_path, time_budget, toml_text)

        result = runner.collect_outputs(output_dir, spec_text)
        with (job_dir / "result.json").open("w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        self._transition(job, status="completed", completed_at=_now())

    # -- state helpers ------------------------------------------------------ #
    def _fail(self, job_id: str, message: str) -> None:
        job = self.get(job_id)
        if job is None:
            return
        self._transition(job, status="failed", error=message, completed_at=_now())

    def _transition(self, job: Job, **changes: Any) -> None:
        with self._lock:
            for key, value in changes.items():
                setattr(job, key, value)
        self._persist(job)

    def _job_dir(self, job_id: str) -> Path:
        return self.cfg.jobs_dir / job_id

    def _persist(self, job: Job) -> None:
        job_dir = self._job_dir(job.id)
        job_dir.mkdir(parents=True, exist_ok=True)
        with (job_dir / "status.json").open("w", encoding="utf-8") as f:
            json.dump(job.public(), f, indent=2)
