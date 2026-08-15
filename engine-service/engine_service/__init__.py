"""AutoRestTest engine-service: a Flask microservice that wraps the
autoresttest-core engine behind an async-job HTTP API."""

from __future__ import annotations

from flask import Flask

from .config import Config
from .generation import GenerationManager
from .graphs import GraphManager
from .jobs import JobManager
from .routes import bp


def create_app(config: Config | None = None) -> Flask:
    """Application factory. Wires the job managers onto the app and registers
    the HTTP routes.

    Test runs, spec generations, and dependency-graph builds each get their own
    manager, queue, and worker thread. Runs must be serialized (the engine reads
    one global configurations.toml) and can occupy their queue for hours, while
    a generation runs for hours more and a graph build finishes in seconds —
    sharing a queue would let the slowest of the three block the other two
    indefinitely.
    """
    app = Flask(__name__)
    cfg = config or Config.from_env()
    app.config["ENGINE_CONFIG"] = cfg
    # Reject oversized bodies at the WSGI layer instead of buffering a hostile
    # upload into memory first. The margin covers multipart framing overhead.
    app.config["MAX_CONTENT_LENGTH"] = cfg.oops_max_zip_bytes + 1024 * 1024
    app.config["JOB_MANAGER"] = JobManager(cfg)
    app.config["GENERATION_MANAGER"] = GenerationManager(cfg)
    app.config["GRAPH_MANAGER"] = GraphManager(cfg)
    app.register_blueprint(bp)
    return app


__all__ = ["create_app", "Config", "JobManager", "GenerationManager", "GraphManager"]
