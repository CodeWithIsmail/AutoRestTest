"""Production/dev entry point for the engine-service.

    python wsgi.py            # serve with waitress on $PORT (default 5000)
"""

from __future__ import annotations

from engine_service import create_app
from engine_service.config import Config

app = create_app()


if __name__ == "__main__":
    from waitress import serve

    cfg: Config = app.config["ENGINE_CONFIG"]
    print(f"engine-service listening on http://0.0.0.0:{cfg.port} (mode={cfg.engine_mode})")
    serve(app, host="0.0.0.0", port=cfg.port)
