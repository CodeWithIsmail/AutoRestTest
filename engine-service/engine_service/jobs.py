"""Async job management: an in-memory registry plus a single background worker
that processes runs one at a time (the engine reads a single global
configurations.toml, so runs must be serialized)."""

from __future__ import annotations

import hashlib
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
from . import proxy, runner


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _spec_name(spec_text: str) -> str:
    """Stable, filesystem-safe name for a spec, used as the engine's cache key."""
    digest = hashlib.sha256(spec_text.encode("utf-8")).hexdigest()[:16]
    return f"spec_{digest}"


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
        # Per-job capture context for the recording proxy, keyed by job id:
        # {target, matcher, seq, lock, dir}. Present only while a real run is
        # in flight (the proxy is only reachable during that window).
        self._proxy: Dict[str, Dict[str, Any]] = {}
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
            self._proxy.pop(job_id, None)
        job_dir = self._job_dir(job_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        return existed

    # -- recording proxy ---------------------------------------------------- #
    def _register_proxy(
        self, job_id: str, target: str, spec_text: str, job_dir: Path
    ) -> None:
        ctx = {
            "target": target,
            "matcher": proxy.PathMatcher(spec_text),
            "seq": [0],
            "lock": threading.Lock(),
            "file": job_dir / "requests.jsonl",
        }
        # Start each run with a clean capture file.
        try:
            (job_dir / "requests.jsonl").unlink()
        except FileNotFoundError:
            pass
        with self._lock:
            self._proxy[job_id] = ctx

    def get_proxy(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._proxy.get(job_id)

    def record_request(self, job_id: str, record: Dict[str, Any]) -> Optional[int]:
        """Append one captured request/response to the job's capture file.
        Returns the assigned sequence number, or None if the job isn't
        capturing (e.g. it finished)."""
        ctx = self.get_proxy(job_id)
        if ctx is None:
            return None
        with ctx["lock"]:
            seq = ctx["seq"][0]
            ctx["seq"][0] += 1
            record = {"seq": seq, "timestamp": _now(), **record}
            with ctx["file"].open("a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        return seq

    def read_requests(self, job_id: str) -> list[Dict[str, Any]]:
        """Read all captured request records for a completed job."""
        path = self._job_dir(job_id) / "requests.jsonl"
        if not path.exists():
            return []
        records: list[Dict[str, Any]] = []
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records

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

        # The engine keys its graph and Q-table caches on the spec file's stem,
        # so a per-job name (the old `job_<id>`) guaranteed a cache miss on every
        # run. Deriving the name from the spec's content instead lets a re-run of
        # the same API skip the two un-timed setup phases entirely. Hashed from
        # the *original* spec, before the per-job proxy URL is injected into
        # `servers` — otherwise every run would still be unique.
        spec_name = _spec_name(params["spec"])
        job_dir = self._job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        real_target = params["targetUrl"]
        runner.validate_target_url(real_target)

        time_budget = int(params["timeBudget"])
        output_dir = self.cfg.core_dir / "data" / spec_name
        # Now that `spec_name` is stable across runs, this directory is shared by
        # every run of the same spec. Clear it first so a run that dies before
        # writing its report can't have the previous run's results collected as
        # if they were its own.
        shutil.rmtree(output_dir, ignore_errors=True)

        try:
            if self.cfg.is_mock:
                # Mock never sends real requests, so no proxy/capture is needed.
                spec_text = runner.inject_target_url(params["spec"], real_target)
                spec_path = job_dir / f"{spec_name}.yaml"
                spec_path.write_text(spec_text, encoding="utf-8")
                runner.run_mock(output_dir, spec_text, time_budget)
            else:
                # Point the engine at our recording proxy; it forwards to the
                # real target and logs every request/response for this job.
                proxy_base = f"http://127.0.0.1:{self.cfg.port}/proxy/{job_id}"
                self._register_proxy(job_id, real_target, params["spec"], job_dir)
                spec_text = runner.inject_target_url(params["spec"], proxy_base)
                spec_path = job_dir / f"{spec_name}.yaml"
                spec_path.write_text(spec_text, encoding="utf-8")

                # Authorization falls back through: per-run authHeader, then a
                # service-wide TEST_AUTH_HEADER env var, then a JWT_TOKEN from the
                # core's own .env (mirrors the core CLI's [custom_headers] bearer
                # auth). A per-run customHeaders object layers arbitrarily-named
                # headers (e.g. X-API-Key) on top, and can also override
                # Authorization itself if the caller sets that key explicitly.
                custom_headers: Dict[str, str] = {}
                auth_header = (
                    params.get("authHeader")
                    or os.getenv("TEST_AUTH_HEADER")
                    or runner.default_auth_header(self.cfg.core_dir)
                )
                if auth_header:
                    custom_headers["Authorization"] = auth_header
                extra_headers = params.get("customHeaders")
                if isinstance(extra_headers, dict):
                    custom_headers.update(
                        {str(k): str(v) for k, v in extra_headers.items()}
                    )

                # Each llm* param is an optional per-job override -- set from the
                # NestJS backend's admin-configurable LLM settings when present,
                # falling back to this service's own env-configured cfg
                # otherwise. cfg stays the single source of truth for standalone/
                # manual use of engine-service (no backend in front of it).
                toml_text = runner.render_config_toml(
                    spec_location=str(spec_path),
                    time_duration=time_budget,
                    mutation_rate=float(params.get("mutationRate", 0.2)),
                    llm_engine=params.get("llmEngine") or self.cfg.llm_engine,
                    llm_api_base=params.get("llmApiBase") or self.cfg.llm_api_base,
                    llm_rpm_limit=int(
                        params.get("llmRpmLimit") or self.cfg.llm_rpm_limit
                    ),
                    llm_max_tokens=int(params.get("llmMaxTokens") or 4096),
                    llm_creative_temperature=float(
                        params.get("llmCreativeTemperature") or 1
                    ),
                    llm_strict_temperature=float(
                        params.get("llmStrictTemperature") or 1
                    ),
                    value_workers=self.cfg.engine_value_workers,
                    use_cache=self.cfg.engine_use_cache,
                    custom_headers=custom_headers or None,
                )
                runner.run_real(
                    self.cfg,
                    spec_path,
                    time_budget,
                    toml_text,
                    log_path=job_dir / "stdout.log",
                    llm_api_key=params.get("llmApiKey"),
                )
        finally:
            # Stop accepting proxy traffic for this job once the engine exits.
            with self._lock:
                self._proxy.pop(job_id, None)

        # collect_outputs only reads paths from the spec, so the proxy-injected
        # servers URL is irrelevant here.
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
