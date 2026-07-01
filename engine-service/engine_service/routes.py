"""HTTP routes for the engine-service."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from flask import Blueprint, current_app, jsonify, request

from .config import Config
from .jobs import JobManager

bp = Blueprint("engine", __name__)

_REQUIRED_FIELDS = ("spec", "targetUrl", "timeBudget")


def _cfg() -> Config:
    return current_app.config["ENGINE_CONFIG"]


def _manager() -> JobManager:
    return current_app.config["JOB_MANAGER"]


@bp.before_request
def _check_token():
    if request.path == "/health":
        return None
    token = _cfg().service_token
    if token and request.headers.get("X-Service-Token") != token:
        return jsonify({"error": "Unauthorized"}), 401
    return None


@bp.get("/health")
def health():
    return jsonify({"status": "ok", "mode": _cfg().engine_mode})


def _validate_body(body: Any) -> Tuple[Dict[str, Any] | None, str | None]:
    if not isinstance(body, dict):
        return None, "Request body must be a JSON object"
    for f in _REQUIRED_FIELDS:
        if f not in body or body[f] in (None, ""):
            return None, f"Missing required field: {f}"
    if not isinstance(body["spec"], str):
        return None, "spec must be a string (raw OAS 3.0 YAML/JSON)"
    try:
        tb = int(body["timeBudget"])
    except (TypeError, ValueError):
        return None, "timeBudget must be an integer number of seconds"
    if tb < 1 or tb > 3600:
        return None, "timeBudget must be between 1 and 3600 seconds"
    mr = body.get("mutationRate", 0.2)
    try:
        mr = float(mr)
    except (TypeError, ValueError):
        return None, "mutationRate must be a number"
    if mr < 0 or mr > 1:
        return None, "mutationRate must be between 0 and 1"
    body["timeBudget"] = tb
    body["mutationRate"] = mr
    return body, None


@bp.post("/runs")
def create_run():
    body, err = _validate_body(request.get_json(silent=True))
    if err:
        return jsonify({"error": err}), 400
    job = _manager().submit(body)
    return jsonify(job.public()), 202


@bp.get("/runs/<job_id>")
def get_run(job_id: str):
    job = _manager().get(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job.public())


@bp.get("/runs/<job_id>/result")
def get_result(job_id: str):
    manager = _manager()
    job = manager.get(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    if job.status != "completed":
        return (
            jsonify({"error": f"Job is {job.status}, result not available yet"}),
            409,
        )
    result = manager.result(job_id)
    if result is None:
        return jsonify({"error": "Result missing"}), 404
    return jsonify(result)


@bp.delete("/runs/<job_id>")
def delete_run(job_id: str):
    if not _manager().delete(job_id):
        return jsonify({"error": "Job not found"}), 404
    return jsonify({"message": "Job deleted"})
