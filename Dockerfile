# syntax=docker/dockerfile:1
#
# Builds engine-service plus its two subprocess dependents:
#   - autoresttest-core (Python 3.10.x only, `poetry`-managed in dev, plain
#     pip-installable via its requirements.txt for containerization)
#   - OOPS-final (Python >=3.12, uv-managed, vendored as-is — never edited)
#
# All stages are pinned to the same Debian release (bookworm) so wheels/venvs
# copied between stages stay glibc/libssl-ABI compatible. Build context must
# be the repo root (this file's own directory) — see the COPY paths below.

########################################
# Stage 1: autoresttest-core venv (Python 3.10)
########################################
FROM python:3.10-slim-bookworm AS core-build

WORKDIR /build/autoresttest-core
COPY autoresttest-core/requirements.txt ./requirements.txt

RUN python -m venv /opt/venvs/core \
 && /opt/venvs/core/bin/pip install --no-cache-dir --upgrade pip==24.0 setuptools==70.0.0 wheel==0.43.0 \
 && /opt/venvs/core/bin/pip install --no-cache-dir -r requirements.txt

########################################
# Stage 2: OOPS-final venv (Python 3.12, uv-managed)
########################################
FROM python:3.12-slim-bookworm AS oops-build

# Pin a specific uv binary rather than curl|sh, so a future uv release can't
# silently change flag semantics under this build.
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

WORKDIR /build/OOPS-final
COPY OOPS-final/pyproject.toml OOPS-final/uv.lock ./

# --default-index overrides the vendored [[tool.uv.index]] Tsinghua mirror
# (OOPS-final/pyproject.toml) WITHOUT editing that file — OOPS-final is
# vendored as-is and must never be modified. --no-install-project: this
# layer only has pyproject.toml + uv.lock (no source yet), and the project
# has no [build-system] table anyway (it's imported via sys.path by
# oops_worker.py, never pip-installed as a package).
RUN uv sync --frozen --no-dev --no-install-project \
    --default-index https://pypi.org/simple

########################################
# Stage 3: final runtime image
########################################
FROM python:3.12-slim-bookworm AS final

# JRE for OOPS's Swagger 2.0 -> OpenAPI 3 upgrade step
# (java -jar core/shared/codegen-3.0.68.jar, already vendored in-repo).
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-jre-headless \
 && rm -rf /var/lib/apt/lists/*
RUN java -version

# Cross-copy ONLY the versioned python3.10 files from core-build — copying
# the whole /usr/local would clobber this stage's own unversioned python3.12
# files (e.g. /usr/local/bin/pip, /usr/local/bin/python3). A venv is never
# self-contained: its pyvenv.cfg points back at this "home" install, so all
# four paths below must be present for /opt/venvs/core to actually run here.
COPY --from=core-build /usr/local/bin/python3.10 /usr/local/bin/python3.10
COPY --from=core-build /usr/local/lib/python3.10 /usr/local/lib/python3.10
COPY --from=core-build /usr/local/lib/libpython3.10.so.1.0 /usr/local/lib/libpython3.10.so.1.0
COPY --from=core-build /usr/local/include/python3.10 /usr/local/include/python3.10
RUN ldconfig

# The two venvs.
COPY --from=core-build /opt/venvs/core /opt/venvs/core
COPY --from=oops-build /build/OOPS-final/.venv /app/OOPS-final/.venv

# venv/bin/python is an ABSOLUTE symlink to the generic (unversioned)
# /usr/local/bin/python, not to python3.10 specifically -- python -m venv
# resolves it that way regardless of which base image created it. That's
# harmless in core-build (python:3.10-slim-bookworm, where the generic name
# already means 3.10) but silently wrong here: this stage's own
# /usr/local/bin/python -> python3 -> python3.12, so without this fix the
# venv's "python" would run 3.12 with none of its installed packages on the
# path -- no error, just the wrong interpreter. Repoint it at the versioned
# binary explicitly. (Python's pyvenv.cfg discovery keys off argv0's own
# directory, not the symlink target, so this doesn't break venv detection.)
RUN rm -f /opt/venvs/core/bin/python /opt/venvs/core/bin/python3 /opt/venvs/core/bin/python3.10 \
 && ln -s /usr/local/bin/python3.10 /opt/venvs/core/bin/python \
 && ln -s /usr/local/bin/python3.10 /opt/venvs/core/bin/python3 \
 && ln -s /usr/local/bin/python3.10 /opt/venvs/core/bin/python3.10

# engine-service's own plain deps, straight into this stage's native 3.12
# interpreter (no dedicated venv needed for the Flask app itself).
WORKDIR /app/engine-service
COPY engine-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Source trees.
COPY engine-service/ /app/engine-service/
COPY autoresttest-core/ /app/autoresttest-core/
COPY OOPS-final/ /app/OOPS-final/

ENV CORE_DIR=/app/autoresttest-core \
    OOPS_DIR=/app/OOPS-final \
    OOPS_PYTHON=/app/OOPS-final/.venv/bin/python \
    ENGINE_CMD="/opt/venvs/core/bin/python -m autoresttest.autoresttest" \
    ENGINE_PYTHON=/opt/venvs/core/bin/python \
    PYTHONPATH=/app/autoresttest-core/src \
    JOBS_DIR=/app/autoresttest-core/data/engine-jobs \
    PORT=5000 \
    MPLBACKEND=Agg

WORKDIR /app/engine-service
EXPOSE 5000
CMD ["python", "wsgi.py"]
