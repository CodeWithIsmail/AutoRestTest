import os
import subprocess
import sys
import time
import tomllib

import pytest
import yaml

from engine_service import runner
from engine_service.config import Config


def make_runner_config(tmp_path, core_dir, engine_cmd, timeout_buffer=60) -> Config:
    """A Config with only the fields run_real touches set meaningfully."""
    return Config(
        core_dir=core_dir,
        jobs_dir=tmp_path / "jobs",
        engine_mode="real",
        engine_cmd=engine_cmd,
        api_key="",
        llm_engine="m",
        llm_api_base="b",
        llm_rpm_limit=0,
        service_token="",
        port=5000,
        job_timeout_buffer=timeout_buffer,
        engine_value_workers=2,
        engine_use_cache=False,
        oops_dir=tmp_path / "oops",
        oops_python=tmp_path / "oops" / "python",
        oops_model="m",
        oops_timeout=60,
        oops_rpm_limit=1,
        oops_batch_semaphore=1,
        oops_max_zip_bytes=1,
        oops_max_source_bytes=1,
        oops_max_files=1,
    )


def _pid_alive(pid: int) -> bool:
    if os.name == "nt":
        out = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True
        ).stdout
        return str(pid) in out
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True

SPEC = """openapi: 3.0.0
info:
  title: Demo
  version: 1.0.0
servers:
  - url: http://old.example.com
paths:
  /pets:
    get:
      responses:
        '200': {description: OK}
    post:
      responses:
        '201': {description: Created}
  /pets/{id}:
    delete:
      responses:
        '204': {description: No content}
"""


def test_validate_target_url_accepts_http_and_https():
    assert runner.validate_target_url("http://localhost:8080") == "http://localhost:8080"
    assert runner.validate_target_url("https://api.example.com/base") == (
        "https://api.example.com/base"
    )


@pytest.mark.parametrize("bad", ["", "localhost:8080", "ftp://x", "not a url"])
def test_validate_target_url_rejects_bad(bad):
    with pytest.raises(ValueError):
        runner.validate_target_url(bad)


def test_inject_target_url_overrides_servers():
    out = runner.inject_target_url(SPEC, "http://localhost:9000/api")
    spec = yaml.safe_load(out)
    assert spec["servers"] == [{"url": "http://localhost:9000/api"}]
    # untouched content survives
    assert "/pets" in spec["paths"]


def test_render_config_toml_roundtrips():
    text = runner.render_config_toml(
        spec_location="/abs/spec.yaml",
        time_duration=120,
        mutation_rate=0.35,
        llm_engine="test/model",
        llm_api_base="https://example/v1",
        auth_header="Bearer abc",
    )
    doc = tomllib.loads(text)
    assert doc["spec"]["location"] == "/abs/spec.yaml"
    assert doc["request_generation"]["time_duration"] == 120
    assert doc["request_generation"]["mutation_rate"] == 0.35
    assert doc["llm"]["engine"] == "test/model"
    assert doc["api"]["override_url"] is False
    assert doc["custom_headers"]["Authorization"] == "Bearer abc"


def test_render_config_toml_omits_headers_when_none():
    text = runner.render_config_toml(
        spec_location="/s.yaml",
        time_duration=60,
        mutation_rate=0.2,
        llm_engine="m",
        llm_api_base="b",
        auth_header=None,
    )
    doc = tomllib.loads(text)
    assert "custom_headers" not in doc


def test_render_config_toml_carries_workers_and_cache():
    text = runner.render_config_toml(
        spec_location="/s.yaml",
        time_duration=60,
        mutation_rate=0.2,
        llm_engine="m",
        llm_api_base="b",
        auth_header=None,
        value_workers=8,
        use_cache=True,
    )
    doc = tomllib.loads(text)
    assert doc["agent"]["value"]["max_workers"] == 8
    assert doc["cache"]["use_cached_graph"] is True
    assert doc["cache"]["use_cached_table"] is True


def test_run_real_recovers_a_stale_backup(tmp_path, monkeypatch):
    """A .bak on disk is the residue of a run that died before restoring: it
    holds the user's config while configurations.toml holds a dead job's. The
    next run must put it back, or the job config becomes the permanent
    "original" that every later run restores."""
    core = tmp_path / "core"
    core.mkdir()
    user_config = "# the user's real config\n"
    (core / "configurations.toml").write_text("# a dead run's job config\n")
    (core / "configurations.toml.engine-service.bak").write_text(user_config)

    noop = tmp_path / "noop.py"
    noop.write_text("pass\n")
    spec = tmp_path / "spec.yaml"
    spec.write_text("openapi: 3.0.0\n")

    cfg = make_runner_config(tmp_path, core, f"{sys.executable} {noop}")
    runner.run_real(cfg, spec, 1, "# this run's config\n", log_path=tmp_path / "l.log")

    assert (core / "configurations.toml").read_text() == user_config
    assert not (core / "configurations.toml.engine-service.bak").exists()


def test_run_real_kills_the_whole_tree_on_timeout(tmp_path):
    """`Popen.kill()` reaches only the direct child, so a wrapper (poetry, a
    shell) would leave the engine running and — under the old pipe-based
    capture — hang the caller forever waiting on handles the orphan still held."""
    child = tmp_path / "child.py"
    child.write_text("import time\ntime.sleep(300)\n")
    parent = tmp_path / "parent.py"
    parent.write_text(
        "import subprocess, sys, time\n"
        f"p = subprocess.Popen([sys.executable, r'{child}'])\n"
        "print('CHILD_PID', p.pid, flush=True)\n"
        "time.sleep(300)\n"
    )
    core = tmp_path / "core"
    core.mkdir()
    spec = tmp_path / "spec.yaml"
    spec.write_text("openapi: 3.0.0\n")
    log = tmp_path / "engine.log"

    cfg = make_runner_config(
        tmp_path, core, f"{sys.executable} {parent}", timeout_buffer=5
    )
    started = time.monotonic()
    with pytest.raises(RuntimeError, match="budget"):
        runner.run_real(cfg, spec, 0, "# toml\n", log_path=log)
    # The point of the assertion: it returns at all.
    assert time.monotonic() - started < 90

    grandchild = int(log.read_text(errors="replace").split("CHILD_PID")[1].split()[0])
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and _pid_alive(grandchild):
        time.sleep(0.2)
    assert not _pid_alive(grandchild), "grandchild was orphaned"


def test_normalize_report_maps_fields():
    report = {
        "Total Requests Sent": 100,
        "Status Code Distribution": {"200": 80, "500": 5},
        "Number of Total Operations": 10,
        "Number of Successfully Processed Operations": 8,
        "Percentage of Successfully Processed Operations": "80.0%",
        "Number of Unique Server Errors": 5,
        "Operations with Server Errors": 2,
    }
    out = runner.normalize_report(report, {"op1": {"200": 3}}, [{"err": 1}])
    s = out["summary"]
    assert s["totalOperations"] == 10
    assert s["successfullyProcessed"] == 8
    assert s["coveragePct"] == 80.0
    assert s["statusCodeDistribution"] == {"200": 80, "500": 5}
    assert out["operationStatusCodes"] == {"op1": {"200": 3}}
    assert out["serverErrors"] == [{"err": 1}]
    assert out["rawReport"] is report


def test_mock_report_counts_operations():
    rep = runner._mock_report(SPEC, 300)
    # get + post + delete = 3 operations
    assert rep["Number of Total Operations"] == 3
    assert rep["Duration"] == "300 seconds"


def test_normalize_endpoint_path():
    assert runner.normalize_endpoint_path("/pets/{id}") == "pets_id"
    assert runner.normalize_endpoint_path("/") == "root"


def test_build_operation_index_uses_operation_id_then_fallback():
    spec = """openapi: 3.0.0
info: {title: T, version: '1'}
paths:
  /pets:
    get:
      operationId: listPets
      responses: {'200': {description: OK}}
  /pets/{id}:
    delete:
      responses: {'204': {description: No content}}
"""
    index = runner.build_operation_index(spec)
    assert index["listPets"] == {"method": "GET", "path": "/pets"}
    # no operationId -> synthesized "<method>_<normalized-path>"
    assert index["delete_pets_id"] == {"method": "DELETE", "path": "/pets/{id}"}


def test_build_operations_joins_and_flags_passed():
    index = {
        "listPets": {"method": "GET", "path": "/pets"},
        "delete_pets_id": {"method": "DELETE", "path": "/pets/{id}"},
    }
    op_status = {
        "listPets": {"200": 5, "404": 1},
        "delete_pets_id": {"500": 2},
    }
    errors = {"delete_pets_id": [{"status_code": 500}]}
    ops = {o["operationId"]: o for o in runner.build_operations(op_status, index, errors)}
    assert ops["listPets"]["method"] == "GET"
    assert ops["listPets"]["path"] == "/pets"
    assert ops["listPets"]["passed"] is True
    assert ops["listPets"]["totalRequests"] == 6
    assert ops["delete_pets_id"]["passed"] is False
    assert ops["delete_pets_id"]["serverErrors"] == [{"status_code": 500}]
