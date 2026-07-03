"""HTTP routes for the engine-service."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from flask import Blueprint, Response, current_app, jsonify, request

from . import proxy
from .config import Config
from .jobs import JobManager

bp = Blueprint("engine", __name__)

_REQUIRED_FIELDS = ("spec", "targetUrl", "timeBudget")

# Methods the recording proxy accepts and forwards.
_PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


def _cfg() -> Config:
    return current_app.config["ENGINE_CONFIG"]


def _manager() -> JobManager:
    return current_app.config["JOB_MANAGER"]


@bp.before_request
def _check_token():
    # /health and the internal recording proxy (called by the engine subprocess,
    # which has no service token) are exempt from token auth.
    if request.path == "/health" or request.path.startswith("/proxy/"):
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


@bp.get("/runs/<job_id>/requests")
def get_requests(job_id: str):
    manager = _manager()
    if manager.get(job_id) is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({"requests": manager.read_requests(job_id)})


@bp.delete("/runs/<job_id>")
def delete_run(job_id: str):
    if not _manager().delete(job_id):
        return jsonify({"error": "Job not found"}), 404
    return jsonify({"message": "Job deleted"})


# --------------------------------------------------------------------------- #
# Recording proxy — the engine sends its requests here; we forward to the real
# target and capture every request/response for the job.
# --------------------------------------------------------------------------- #
@bp.route("/proxy/<job_id>", defaults={"subpath": ""}, methods=_PROXY_METHODS)
@bp.route("/proxy/<job_id>/<path:subpath>", methods=_PROXY_METHODS)
def proxy_forward(job_id: str, subpath: str):
    manager = _manager()
    ctx = manager.get_proxy(job_id)
    if ctx is None:
        # Job isn't capturing (finished/unknown) — the engine shouldn't be
        # hitting us; report a gateway error rather than forwarding blindly.
        return jsonify({"error": "No active capture for this job"}), 502

    record = proxy.forward(
        target=ctx["target"],
        subpath=subpath,
        query_string=request.query_string,
        method=request.method,
        headers=dict(request.headers),
        body=request.get_data(),
    )

    raw_path = "/" + subpath.strip("/") if subpath.strip("/") else "/"
    record["path"] = raw_path
    record["endpointPath"] = ctx["matcher"].match(request.method, raw_path)

    # Split the internal return-only fields from the persisted record.
    return_headers = record.pop("_returnHeaders")
    return_body = record.pop("_returnBody")
    return_status = record.pop("_returnStatus")
    manager.record_request(job_id, record)

    return Response(return_body, status=return_status, headers=return_headers)
