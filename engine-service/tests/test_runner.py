import tomllib

import pytest
import yaml

from engine_service import runner

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
