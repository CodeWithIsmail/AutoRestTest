"""AutoRestTest engine-service: a Flask microservice that wraps the
autoresttest-core engine behind an async-job HTTP API."""

from __future__ import annotations

from flask import Flask

from .config import Config
from .jobs import JobManager
from .routes import bp


def create_app(config: Config | None = None) -> Flask:
    """Application factory. Wires the job manager onto the app and registers
    the HTTP routes."""
    app = Flask(__name__)
    cfg = config or Config.from_env()
    app.config["ENGINE_CONFIG"] = cfg
    app.config["JOB_MANAGER"] = JobManager(cfg)
    app.register_blueprint(bp)
    return app


__all__ = ["create_app", "Config", "JobManager"]
