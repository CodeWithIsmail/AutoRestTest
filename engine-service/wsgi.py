"""Production/dev entry point for the engine-service.

    python wsgi.py            # serve with waitress on $PORT (default 5000)
"""

from __future__ import annotations

import atexit
import os
import signal

from engine_service import create_app
from engine_service.config import Config
from engine_service.runner import shutdown_active_engine

app = create_app()


def _install_shutdown_hooks() -> None:
    """Take the running engine down with us.

    A test run is a subprocess that outlives its parent quite happily, so
    stopping this service used to leave an engine behind still driving traffic
    at someone's API. `atexit` covers a clean exit and Ctrl-C (which unwinds as
    KeyboardInterrupt); the SIGTERM handler covers `kill` and container stops,
    which skip `atexit` entirely.

    Neither runs when the process is killed outright — `Stop-Process`, Task
    Manager, SIGKILL. That case is handled a layer down, by the Windows job
    object in `runner._assign_kill_on_close_job`.
    """
    atexit.register(shutdown_active_engine)

    def _on_signal(signum, _frame):
        shutdown_active_engine()
        signal.signal(signum, signal.SIG_DFL)
        os.kill(os.getpid(), signum)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _on_signal)
        except (ValueError, OSError, AttributeError):
            # Not the main thread, or the platform doesn't deliver this signal.
            pass


if __name__ == "__main__":
    from waitress import serve

    _install_shutdown_hooks()

    cfg: Config = app.config["ENGINE_CONFIG"]
    print(f"engine-service listening on http://0.0.0.0:{cfg.port} (mode={cfg.engine_mode})")
    serve(app, host="0.0.0.0", port=cfg.port)
