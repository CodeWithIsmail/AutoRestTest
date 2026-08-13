"""Spec generation jobs: upload a source archive, get an OpenAPI document back.

Deliberately mirrors ``jobs.JobManager`` so the two read side by side, but runs
on its own queue and its own worker thread. Test runs are serialized because the
engine reads one global ``configurations.toml``; OOPS has no such constraint,
and a generation can take hours — sharing the engine queue would mean one spec
generation blocks every test run on the instance.
"""

from __future__ import annotations

import json
import queue
import shutil
import stat
import threading
import time
import uuid
import zipfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import Config
from . import oops_runner

# Mirrors STEPS in oops_worker.py, which runs under a different interpreter and
# so cannot share the constant. Only mock mode reads this list; the real worker
# reports its own progress. Keep the two in step.
STEPS: List[tuple] = [
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

STEP_TOTAL = len(STEPS)

_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Generation:
    id: str
    status: str = "pending"  # pending | running | completed | failed
    source_name: str = ""
    title: str = ""
    error: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=_now)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def public(self) -> Dict[str, Any]:
        d = asdict(self)
        return {
            "jobId": d["id"],
            "status": d["status"],
            "sourceName": d["source_name"],
            "title": d["title"],
            "error": d["error"],
            "warnings": d["warnings"],
            "createdAt": d["created_at"],
            "startedAt": d["started_at"],
            "completedAt": d["completed_at"],
            # Overwritten from progress.json by GenerationManager.public_state().
            "step": None,
            "stepLabel": None,
            "stepIndex": 0,
            "stepTotal": STEP_TOTAL,
        }


class ArchiveError(ValueError):
    """A source archive was rejected before any work was scheduled."""


def count_operations(document: Dict[str, Any]) -> int:
    paths = document.get("paths") or {}
    if not isinstance(paths, dict):
        return 0
    return sum(
        1
        for item in paths.values()
        if isinstance(item, dict)
        for key in item
        if key.lower() in _METHODS
    )


class GenerationManager:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._gens: Dict[str, Generation] = {}
        self._params: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[str]" = queue.Queue()
        cfg.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._worker = threading.Thread(
            target=self._run_worker, name="oops-worker", daemon=True
        )
        self._worker.start()

    # -- public API --------------------------------------------------------- #
    def submit(self, params: Dict[str, Any], archive: bytes) -> Generation:
        """Validate and unpack the archive, then queue the generation.

        Extraction happens synchronously so a malformed or oversized upload is
        rejected with a 400 instead of failing minutes later inside a job.
        """
        if len(archive) > self.cfg.oops_max_zip_bytes:
            raise ArchiveError(
                f"Archive exceeds the "
                f"{self.cfg.oops_max_zip_bytes // (1024 * 1024)} MB size limit"
            )

        gen = Generation(
            id=uuid.uuid4().hex,
            source_name=params.get("sourceName", "source.zip"),
            title=params.get("title", ""),
        )
        job_dir = self._job_dir(gen.id)
        job_dir.mkdir(parents=True, exist_ok=True)

        zip_path = job_dir / "source.zip"
        zip_path.write_bytes(archive)

        source_dir = job_dir / "source"
        try:
            file_count = self._extract(zip_path, source_dir)
        except ArchiveError:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise

        if not oops_runner.java_available() and not self.cfg.is_mock:
            # Not fatal: the pipeline still produces a complete Swagger 2.0
            # document, and the backend converts it. Warn so the lower schema
            # fidelity is visible rather than mysterious.
            gen.warnings.append(
                "No Java runtime found — the specification will be converted "
                "from Swagger 2.0, which yields lower-fidelity schemas. Install "
                "a JRE (Temurin 17+) for best results."
            )

        params = {
            **params,
            "sourceDir": str(source_dir),
            "fileCount": file_count,
        }
        (job_dir / "params.json").write_text(
            json.dumps(params, indent=2), encoding="utf-8"
        )

        with self._lock:
            self._gens[gen.id] = gen
            self._params[gen.id] = params
        self._persist(gen)
        self._queue.put(gen.id)
        return gen

    def get(self, gen_id: str) -> Optional[Generation]:
        with self._lock:
            return self._gens.get(gen_id)

    def public_state(self, gen_id: str) -> Optional[Dict[str, Any]]:
        """Job envelope merged with the worker's latest progress checkpoint."""
        gen = self.get(gen_id)
        if gen is None:
            return None
        state = gen.public()
        progress = self._read_json(self._job_dir(gen_id) / "progress.json")
        if progress:
            state.update(
                {
                    "step": progress.get("step"),
                    "stepLabel": progress.get("stepLabel"),
                    "stepIndex": progress.get("stepIndex", 0),
                    "stepTotal": progress.get("stepTotal", STEP_TOTAL),
                }
            )
        return state

    def result(self, gen_id: str) -> Optional[Dict[str, Any]]:
        """The generated document, as OAS 3 when available and Swagger 2.0 when
        the upgrade step could not run."""
        job_dir = self._job_dir(gen_id)
        gen = self.get(gen_id)
        warnings = list(gen.warnings) if gen else []

        document = self._read_json(job_dir / "openapi.json")
        fmt = "oas3"
        if document is None:
            document = self._read_json(job_dir / "swagger2.json")
            fmt = "swagger2"
        if document is None:
            return None

        return {
            "openapi": json.dumps(document, indent=2, ensure_ascii=False),
            "format": fmt,
            "operationCount": count_operations(document),
            "warnings": warnings,
        }

    def delete(self, gen_id: str) -> bool:
        with self._lock:
            existed = self._gens.pop(gen_id, None) is not None
            self._params.pop(gen_id, None)
        job_dir = self._job_dir(gen_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        return existed

    # -- archive extraction -------------------------------------------------- #
    def _extract(self, zip_path: Path, dest: Path) -> int:
        """Unpack a source archive safely.

        The upload is untrusted input, and these checks are the only thing
        between it and an arbitrary write on the host filesystem. Entries are
        rejected — not skipped — so a hostile archive fails loudly.
        """
        dest.mkdir(parents=True, exist_ok=True)
        resolved_dest = dest.resolve()

        try:
            archive = zipfile.ZipFile(zip_path)
        except zipfile.BadZipFile as exc:
            raise ArchiveError("The uploaded file is not a valid zip archive") from exc

        with archive:
            entries = [e for e in archive.infolist() if not e.is_dir()]

            if not entries:
                raise ArchiveError("The archive contains no files")
            if len(entries) > self.cfg.oops_max_files:
                raise ArchiveError(
                    f"The archive contains {len(entries)} files, above the "
                    f"{self.cfg.oops_max_files} file limit. Remove vendored "
                    "dependencies (node_modules, venv, build output) and retry."
                )

            total = sum(e.file_size for e in entries)
            if total > self.cfg.oops_max_source_bytes:
                raise ArchiveError(
                    f"The archive expands to "
                    f"{total // (1024 * 1024)} MB, above the "
                    f"{self.cfg.oops_max_source_bytes // (1024 * 1024)} MB limit"
                )

            prefix = self._common_prefix(entries)

            for entry in entries:
                # Symlinks can point anywhere; the pipeline never needs them.
                mode = entry.external_attr >> 16
                if stat.S_ISLNK(mode):
                    raise ArchiveError(
                        f"The archive contains a symbolic link ({entry.filename}), "
                        "which is not allowed"
                    )

                name = entry.filename.replace("\\", "/")
                if name.startswith("/") or ".." in Path(name).parts:
                    raise ArchiveError(
                        f"The archive contains an unsafe path ({entry.filename})"
                    )

                relative = name[len(prefix):] if prefix else name
                if not relative:
                    continue

                target = (dest / relative).resolve()
                if not target.is_relative_to(resolved_dest):
                    raise ArchiveError(
                        f"The archive contains an unsafe path ({entry.filename})"
                    )

                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry) as src, target.open("wb") as out:
                    shutil.copyfileobj(src, out)

        return len(entries)

    @staticmethod
    def _common_prefix(entries: List[zipfile.ZipInfo]) -> str:
        """The single wrapper directory to strip, if there is one.

        Archives downloaded from GitHub and produced by most desktop tools nest
        everything under one folder; extracting that verbatim would leave the
        pipeline analysing a directory containing only a directory.
        """
        tops = {e.filename.replace("\\", "/").split("/")[0] for e in entries}
        if len(tops) != 1:
            return ""
        top = tops.pop()
        # Only a wrapper if every entry is actually inside it.
        if all(e.filename.replace("\\", "/").startswith(f"{top}/") for e in entries):
            return f"{top}/"
        return ""

    # -- worker -------------------------------------------------------------- #
    def _run_worker(self) -> None:
        while True:
            gen_id = self._queue.get()
            try:
                self._execute(gen_id)
            except Exception as exc:  # noqa: BLE001 - record and keep serving
                self._fail(gen_id, str(exc))
            finally:
                self._queue.task_done()

    def _execute(self, gen_id: str) -> None:
        with self._lock:
            gen = self._gens.get(gen_id)
        if gen is None:
            return  # deleted before it ran

        self._transition(gen, status="running", started_at=_now())
        job_dir = self._job_dir(gen_id)

        if self.cfg.is_mock:
            self._run_mock(job_dir)
            self._transition(gen, status="completed", completed_at=_now())
            return

        code = oops_runner.run_oops(self.cfg, job_dir)

        if code == oops_runner.EXIT_SWAGGER2_FALLBACK:
            self._transition(
                gen,
                warnings=gen.warnings
                + [
                    "The OpenAPI 3 upgrade step did not run, so the document was "
                    "converted from the pipeline's Swagger 2.0 output."
                ],
            )
        elif code != oops_runner.EXIT_OK:
            raise RuntimeError(self._failure_message(job_dir, code))

        self._transition(gen, status="completed", completed_at=_now())

    def _failure_message(self, job_dir: Path, code: int) -> str:
        detail = ""
        for name in ("error.txt", "stdout.log"):
            path = job_dir / name
            if path.exists():
                text = path.read_text(encoding="utf-8", errors="replace").strip()
                if text:
                    detail = text[-2000:]
                    break
        return f"Spec generation exited with code {code}" + (
            f": {detail}" if detail else ""
        )

    def _run_mock(self, job_dir: Path) -> None:
        """Walk the full progress sequence and emit a small canned document.

        The offline seam that makes the whole feature demoable and testable in
        seconds, mirroring runner.run_mock for test runs.
        """
        for index, (step, label) in enumerate(STEPS, start=1):
            (job_dir / "progress.json").write_text(
                json.dumps(
                    {
                        "step": step,
                        "stepLabel": label,
                        "stepIndex": index,
                        "stepTotal": len(STEPS),
                        "at": _now(),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            time.sleep(0.2)

        params = self._read_json(job_dir / "params.json") or {}
        document = {
            "openapi": "3.0.3",
            "info": {
                "title": params.get("title") or "Generated API",
                "version": params.get("version") or "1.0.0",
            },
            "paths": {
                "/items": {
                    "get": {
                        "summary": "List items",
                        "responses": {"200": {"description": "OK"}},
                    },
                    "post": {
                        "summary": "Create an item",
                        "responses": {"201": {"description": "Created"}},
                    },
                },
                "/items/{itemId}": {
                    "get": {
                        "summary": "Fetch one item",
                        "parameters": [
                            {
                                "name": "itemId",
                                "in": "path",
                                "required": True,
                                "schema": {"type": "string"},
                            }
                        ],
                        "responses": {"200": {"description": "OK"}},
                    }
                },
            },
        }
        (job_dir / "openapi.json").write_text(
            json.dumps(document, indent=2), encoding="utf-8"
        )

    # -- state helpers ------------------------------------------------------- #
    def _fail(self, gen_id: str, message: str) -> None:
        gen = self.get(gen_id)
        if gen is None:
            return
        self._transition(gen, status="failed", error=message, completed_at=_now())

    def _transition(self, gen: Generation, **changes: Any) -> None:
        with self._lock:
            for key, value in changes.items():
                setattr(gen, key, value)
        self._persist(gen)

    def _job_dir(self, gen_id: str) -> Path:
        return self.cfg.jobs_dir / gen_id

    def _persist(self, gen: Generation) -> None:
        job_dir = self._job_dir(gen.id)
        job_dir.mkdir(parents=True, exist_ok=True)
        with (job_dir / "status.json").open("w", encoding="utf-8") as f:
            json.dump(gen.public(), f, indent=2)

    @staticmethod
    def _read_json(path: Path) -> Optional[Dict[str, Any]]:
        if not path.exists():
            return None
        try:
            with path.open(encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None
