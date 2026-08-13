"""Tests for the codebase-to-OpenAPI generation endpoints.

Everything here runs in mock mode: the OOPS pipeline itself is LLM-bound and
takes hours, so the offline seam in GenerationManager._run_mock is what makes
this path testable at all. The archive-safety checks are exercised directly
against the manager, since they run before any job is queued.
"""

import io
import time
import zipfile

import pytest

from engine_service import create_app
from engine_service.generation import ArchiveError, GenerationManager

from .test_api import make_config


@pytest.fixture
def client(tmp_path):
    app = create_app(make_config(tmp_path))
    app.testing = True
    return app.test_client()


def make_zip(entries: dict[str, str]) -> io.BytesIO:
    # Deflated, like any real-world archive — and required for the zip-bomb
    # test, where the point is that a small upload expands to a large tree.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    buf.seek(0)
    return buf


def post_zip(client, entries: dict[str, str], **form):
    data = {"file": (make_zip(entries), "source.zip"), **form}
    return client.post(
        "/generations", data=data, content_type="multipart/form-data"
    )


def wait_for(client, gen_id, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        state = client.get(f"/generations/{gen_id}").get_json()
        if state["status"] in ("completed", "failed"):
            return state
        time.sleep(0.1)
    raise AssertionError("generation did not settle in time")


# --- happy path ------------------------------------------------------------ #


def test_full_lifecycle_mock(client):
    res = post_zip(
        client,
        {"src/routes.js": "app.get('/items', handler)"},
        title="Demo API",
        version="2.1.0",
    )
    assert res.status_code == 202
    body = res.get_json()
    assert body["status"] == "pending"
    assert body["stepTotal"] == 9

    state = wait_for(client, body["jobId"])
    assert state["status"] == "completed"
    assert state["stepIndex"] == 9
    assert state["stepLabel"] == "Finalising the specification"
    assert state["error"] is None

    result = client.get(f"/generations/{body['jobId']}/result")
    assert result.status_code == 200
    payload = result.get_json()
    assert payload["format"] == "oas3"
    assert payload["operationCount"] == 3
    assert '"title": "Demo API"' in payload["openapi"]
    assert '"version": "2.1.0"' in payload["openapi"]


def test_delete_removes_job(client):
    gen_id = post_zip(client, {"app.py": "x = 1"}).get_json()["jobId"]
    wait_for(client, gen_id)

    assert client.delete(f"/generations/{gen_id}").status_code == 200
    assert client.get(f"/generations/{gen_id}").status_code == 404
    assert client.delete(f"/generations/{gen_id}").status_code == 404


def test_result_409_before_completion(client):
    gen_id = post_zip(client, {"app.py": "x = 1"}).get_json()["jobId"]
    # The mock walks nine steps with a sleep between each, so the job is still
    # running immediately after submit.
    res = client.get(f"/generations/{gen_id}/result")
    assert res.status_code == 409
    assert "not available yet" in res.get_json()["error"]


def test_result_404_for_unknown_job(client):
    assert client.get("/generations/nope").status_code == 404
    assert client.get("/generations/nope/result").status_code == 404


# --- request validation ---------------------------------------------------- #


def test_missing_file_rejected(client):
    res = client.post("/generations", data={}, content_type="multipart/form-data")
    assert res.status_code == 400
    assert "file" in res.get_json()["error"]


def test_non_zip_rejected(client):
    res = client.post(
        "/generations",
        data={"file": (io.BytesIO(b"not a zip"), "source.tar.gz")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
    assert ".zip" in res.get_json()["error"]


def test_corrupt_zip_rejected(client):
    res = client.post(
        "/generations",
        data={"file": (io.BytesIO(b"definitely not a zip"), "source.zip")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
    assert "not a valid zip" in res.get_json()["error"]


def test_ignore_paths_reach_the_pipeline(client, tmp_path):
    res = post_zip(
        client,
        {"app.py": "x = 1"},
        ignorePath="node_modules, dist ,,coverage",
    )
    gen_id = res.get_json()["jobId"]
    params = (tmp_path / "jobs" / gen_id / "params.json").read_text(encoding="utf-8")
    assert '"node_modules"' in params
    assert '"dist"' in params
    assert '"coverage"' in params
    # Credentials are excluded by default so they reach neither the prompt
    # context nor the shell tool the pipeline hands to the model.
    assert '"env"' in params


# --- archive safety -------------------------------------------------------- #


@pytest.fixture
def manager(tmp_path):
    return GenerationManager(make_config(tmp_path))


def submit_entries(manager, entries: dict[str, str]):
    return manager.submit({"sourceName": "s.zip"}, make_zip(entries).read())


def test_zip_slip_rejected(manager):
    with pytest.raises(ArchiveError, match="unsafe path"):
        submit_entries(manager, {"../../escaped.py": "pwned"})


def test_absolute_path_rejected(manager):
    with pytest.raises(ArchiveError, match="unsafe path"):
        submit_entries(manager, {"/etc/passwd": "pwned"})


def test_empty_archive_rejected(manager):
    with pytest.raises(ArchiveError, match="no files"):
        submit_entries(manager, {})


def test_too_many_files_rejected(manager):
    # make_config caps oops_max_files at 50.
    with pytest.raises(ArchiveError, match="file limit"):
        submit_entries(manager, {f"f{i}.py": "x" for i in range(60)})


def test_oversize_expansion_rejected(manager):
    # A zip bomb compresses tiny but expands past oops_max_source_bytes (4 MB).
    with pytest.raises(ArchiveError, match="above the"):
        submit_entries(manager, {"big.txt": "a" * (5 * 1024 * 1024)})


def test_oversize_archive_rejected(manager):
    # Incompressible bytes, so the archive itself clears oops_max_zip_bytes (1 MB).
    import os

    payload = os.urandom(2 * 1024 * 1024).hex()
    with pytest.raises(ArchiveError, match="size limit"):
        manager.submit({"sourceName": "s.zip"}, make_zip({"blob.bin": payload}).read())


def test_symlink_rejected(manager, tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        info = zipfile.ZipInfo("link")
        # 0xA1FF = symlink mode in the high 16 bits of external_attr.
        info.external_attr = 0xA1FF0000
        archive.writestr(info, "/etc/passwd")
    buf.seek(0)
    with pytest.raises(ArchiveError, match="symbolic link"):
        manager.submit({"sourceName": "s.zip"}, buf.read())


def test_single_top_level_directory_is_stripped(manager, tmp_path):
    gen = submit_entries(
        manager,
        {"repo-main/src/app.py": "x = 1", "repo-main/README.md": "hi"},
    )
    source = tmp_path / "jobs" / gen.id / "source"
    assert (source / "src" / "app.py").exists()
    assert not (source / "repo-main").exists()


def test_multiple_top_level_entries_are_preserved(manager, tmp_path):
    gen = submit_entries(manager, {"src/app.py": "x = 1", "setup.py": "y = 2"})
    source = tmp_path / "jobs" / gen.id / "source"
    assert (source / "src" / "app.py").exists()
    assert (source / "setup.py").exists()


def test_rejected_archive_leaves_no_job_directory(manager, tmp_path):
    with pytest.raises(ArchiveError):
        submit_entries(manager, {"../escape.py": "pwned"})
    # Only the jobs root should exist; no orphaned per-job directory.
    assert list((tmp_path / "jobs").iterdir()) == []
