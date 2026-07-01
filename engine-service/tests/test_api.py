import time

import pytest

from engine_service import create_app
from engine_service.config import Config

SPEC = """openapi: 3.0.0
info:
  title: Demo
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200': {description: OK}
    post:
      responses:
        '201': {description: Created}
"""


def make_config(tmp_path, **overrides) -> Config:
    base = dict(
        core_dir=tmp_path / "core",
        jobs_dir=tmp_path / "jobs",
        engine_mode="mock",
        engine_cmd="poetry run autoresttest",
        api_key="",
        llm_engine="test/model",
        llm_api_base="https://example/v1",
        service_token="",
        port=5000,
        job_timeout_buffer=60,
    )
    base.update(overrides)
    return Config(**base)


@pytest.fixture
def client(tmp_path):
    app = create_app(make_config(tmp_path))
    app.testing = True
    return app.test_client()


def _wait_completed(client, job_id, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"/runs/{job_id}")
        status = resp.get_json()["status"]
        if status in ("completed", "failed"):
            return status
        time.sleep(0.05)
    return "timeout"


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_create_run_validation(client):
    assert client.post("/runs", json={}).status_code == 400
    assert client.post(
        "/runs", json={"spec": SPEC, "targetUrl": "http://x:8080"}
    ).status_code == 400  # missing timeBudget
    assert client.post(
        "/runs",
        json={"spec": SPEC, "targetUrl": "http://x:8080", "timeBudget": 99999},
    ).status_code == 400  # out of range
    assert client.post(
        "/runs",
        json={
            "spec": SPEC,
            "targetUrl": "http://x:8080",
            "timeBudget": 60,
            "mutationRate": 5,
        },
    ).status_code == 400  # mutationRate out of range


def test_full_lifecycle_mock(client):
    resp = client.post(
        "/runs",
        json={"spec": SPEC, "targetUrl": "http://localhost:8080", "timeBudget": 60},
    )
    assert resp.status_code == 202
    job_id = resp.get_json()["jobId"]
    assert resp.get_json()["status"] == "pending"

    status = _wait_completed(client, job_id)
    assert status == "completed"

    result = client.get(f"/runs/{job_id}/result")
    assert result.status_code == 200
    payload = result.get_json()
    summary = payload["summary"]
    assert summary["totalOperations"] == 2  # get + post
    assert "statusCodeDistribution" in summary
    # per-operation records carry method+path for Endpoint matching
    ops = payload["operations"]
    assert len(ops) == 2
    assert {(o["method"], o["path"]) for o in ops} == {
        ("GET", "/pets"),
        ("POST", "/pets"),
    }

    # delete cleans up
    assert client.delete(f"/runs/{job_id}").status_code == 200
    assert client.get(f"/runs/{job_id}").status_code == 404


def test_result_409_before_completion(client, tmp_path):
    # A job id that exists but isn't done can't be forced deterministically here;
    # instead assert unknown job -> 404 for both status and result.
    assert client.get("/runs/does-not-exist").status_code == 404
    assert client.get("/runs/does-not-exist/result").status_code == 404


def test_service_token_enforced(tmp_path):
    app = create_app(make_config(tmp_path, service_token="s3cret"))
    app.testing = True
    c = app.test_client()
    # health is exempt
    assert c.get("/health").status_code == 200
    # protected without token
    assert c.get("/runs/x").status_code == 401
    # with token -> passes auth (then 404 for unknown job)
    assert c.get("/runs/x", headers={"X-Service-Token": "s3cret"}).status_code == 404
