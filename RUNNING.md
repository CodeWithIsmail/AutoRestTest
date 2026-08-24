# Running AutoRestTest

How to install, configure, and run the whole platform. There is no root-level
package manager — every command below is run from inside its own subproject
directory.

## The pieces

| Service | Stack | Port | Needed for |
|---|---|---|---|
| `engine-service/` | Flask + waitress, Python 3.11 | **5000** | running tests, generating specs |
| `backend/` | NestJS 11 + Prisma 7 | **3000** | everything |
| `frontend/` | Next.js 16 | **3001** | the web UI |
| `autoresttest-core/` | Python 3.10 (poetry) | — | invoked by engine-service |
| `OOPS-final/` | Python ≥3.12 (uv) | — | invoked by engine-service |

`autoresttest-core` and `OOPS-final` are **not** started by hand — engine-service
shells out to them per job. You only install their dependencies.

Start order: **engine-service → backend → frontend**.

---

## 1. One-time setup

### Prerequisites

- Node.js 18+
- Python 3.11 (engine-service), Python 3.10 (autoresttest-core), Python 3.12+ (OOPS-final)
- [Poetry](https://python-poetry.org/) and [uv](https://docs.astral.sh/uv/)
- A PostgreSQL database (the project uses NeonDB)
- **A JRE (Temurin 17+) with `java` on PATH** — only for spec generation from
  source. Without it generation still works, but the spec is converted from
  Swagger 2.0 at lower schema fidelity and the job reports a warning.

Check Java with:

```bash
java -version
```

### engine-service

```bash
cd engine-service
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Linux/macOS: .venv/bin/pip
cp .env.example .env
```

Then edit `engine-service/.env`:

```ini
ENGINE_MODE=mock          # start here; switch to "real" when you want real runs
API_KEY=<your LLM key>    # required only in real mode
LLM_API_BASE=https://integrate.api.nvidia.com/v1
LLM_ENGINE=meta/llama-3.3-70b-instruct
LLM_RPM_LIMIT=40
PORT=5000

# Spec generation uses its own, separate LLM credentials:
OOPS_API_KEY=<your Gemini API key>
OOPS_LLM_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/
```

The rest of the `OOPS_*` settings default correctly for this repo layout; only
change them if `OOPS-final` lives elsewhere or you want a different generation
model.

### backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` — at minimum `DATABASE_URL` and `JWT_SECRET`:

```ini
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=<openssl rand -base64 48>
PORT=3000
CORS_ORIGIN=http://localhost:3001
ENGINE_SERVICE_URL=http://127.0.0.1:5000
LLM_MODE=mock
```

Then set up the database:

```bash
npx prisma migrate deploy    # apply existing migrations
npx prisma generate          # generate the client into generated/prisma/
```

> If NeonDB has auto-suspended, the first command may fail with `P1001`. Just
> run it again — the retry wakes the database.

### frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

`frontend/.env.local` should contain:

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### The two engines

```bash
cd autoresttest-core && poetry install
cd ../OOPS-final && uv sync
```

`OOPS-final` defaults to the Tsinghua PyPI mirror. If that is slow, override it:

```bash
uv sync --index-url https://pypi.org/simple
```

---

## 2. Daily run

**Windows shortcut.** From the repo root:

```powershell
.\start-dev.ps1
```

It writes `scripts/start-{engine,backend,frontend}.ps1` and opens one PowerShell
window per service, started in dependency order. `-GenerateOnly` writes the
scripts without launching; `-SkipEngine` runs backend + frontend only. Each
window preflights its own dependencies and stays open on a crash.

Otherwise, three terminals by hand:

**Terminal 1 — engine-service**

```bash
cd engine-service
.venv/Scripts/python wsgi.py          # Linux/macOS: .venv/bin/python wsgi.py
```

Verify: `curl http://127.0.0.1:5000/health` → `{"mode":"mock","status":"ok"}`

**Terminal 2 — backend**

```bash
cd backend
npm run start:dev
```

Verify: it logs `AutoRestTest API listening on http://localhost:3000`

**Terminal 3 — frontend**

```bash
cd frontend
npm run dev
```

Open **http://localhost:3001**, register an account, and create a project.

---

## 3. Mock mode vs real mode

`ENGINE_MODE` in `engine-service/.env` controls both job types. **Restart
engine-service after changing it.**

### `ENGINE_MODE=mock` — use this for most work

Test runs and spec generation both complete in seconds with canned output. No
LLM key, no cost, no waiting. This is the right mode for building or demoing
anything in the backend or frontend.

### `ENGINE_MODE=real` — actual engine runs

- **Test runs** call `autoresttest-core` against your target API. Wall time is
  `timeBudget` plus an un-timed LLM value-generation phase that often dominates.
  A run is killed at `timeBudget + JOB_TIMEOUT_BUFFER` seconds.
- **Spec generation** calls `OOPS-final`, which reads the whole codebase with an
  LLM. This typically takes **15-20 minutes** on the default Gemini 3.5 Flash
  Lite setup; exclude vendored directories in the UI to cut it down further.

Test runs need a working `API_KEY` and `LLM_API_BASE`. Spec generation needs
its own `OOPS_API_KEY` and `OOPS_LLM_API_URL` — see setup above.

---

## 4. Using the two spec workflows

On a project's **API Spec** tab:

**Upload OAS file** — drop a `.json`/`.yaml`/`.yml` OpenAPI 3.x file. Endpoints
are extracted immediately.

**Generate from source code** — set a title/version, list directories to
exclude, and drop a `.zip` of the API's source (≤ 50 MB). The page polls and
shows progress through 9 pipeline steps. When it finishes you review the
generated spec and click **Use this specification** to apply it — nothing is
written to the project until you do.

> Applying a spec (either way) **replaces all endpoints for the project**,
> including manually added ones.

---

## 5. Watching a real run

Job artifacts live in `engine-service/jobs/<jobId>/`:

```bash
cd engine-service/jobs/<jobId>

cat status.json          # job state
cat progress.json        # spec generation: current pipeline step
tail -f stdout.log       # spec generation: live engine output
cat requests.jsonl       # test runs: every captured request/response
cat openapi.json         # spec generation: the finished document
cat error.txt            # spec generation: traceback, if it failed
```

Test-run engine output lands in `autoresttest-core/data/job_<id>/`.

---

## 6. Tests and checks

```bash
# engine-service (all tests run in mock mode)
cd engine-service && .venv/Scripts/python -m pytest -q

# backend
cd backend && npm test
cd backend && npm run lint
cd backend && npm run build

# frontend
cd frontend && npx tsc --noEmit
cd frontend && npm run lint
cd frontend && npm run build
```

---

## 7. Other useful commands

```bash
# Browse the database
cd backend && npx prisma studio

# Create a migration after editing prisma/schema.prisma
cd backend && npx prisma migrate dev --name <name>

# Run the testing engine standalone, outside the platform
cd autoresttest-core && poetry run autoresttest                # config wizard
cd autoresttest-core && poetry run autoresttest --skip-wizard  # use configurations.toml

# Production backend
cd backend && npm run build && node dist/src/main
```

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `P1001: Can't reach database server` | NeonDB auto-suspended. Re-run the command; the retry wakes it. |
| Backend returns `503 Test engine is unavailable` | engine-service isn't running, or `ENGINE_SERVICE_URL` is wrong. Use `127.0.0.1`, not `localhost` — Node's fetch resolves `localhost` to IPv6 `::1` while Flask listens on IPv4. |
| Frontend calls fail with CORS errors | `CORS_ORIGIN` in `backend/.env` must include `http://localhost:3001`. |
| Test run takes far longer than `timeBudget` | Expected. Only the request-generation phase is time-boxed; graph building and LLM value generation are not. |
| Spec generation warns "no Java runtime" | `java` isn't on PATH. The spec is still usable but has lower-fidelity schemas. Install Temurin 17+. |
| Spec generation fails instantly | Check `jobs/<id>/error.txt`. Usually a missing `OOPS_API_KEY`/`OOPS_LLM_API_URL`, or `OOPS_PYTHON` pointing at a venv that hasn't been created with `uv sync`. |
| Archive rejected on upload | The zip is corrupt, over 50 MB, over 5000 files, or expands past 200 MB. Exclude `node_modules`/`venv`/build output before zipping. |
| `Cannot find module dist/main` | The build emits `dist/src/main.js`. Use `node dist/src/main`. |
| Port already in use | Change `PORT` in the relevant `.env` (and `ENGINE_SERVICE_URL` / `NEXT_PUBLIC_API_BASE_URL` to match). |
| Vercel build succeeds but every page 404s (`NOT_FOUND`) | Check **Project Settings → Build and Deployment → Framework Preset** is explicitly **Next.js**, not "Other" — a known cause of sitewide 404s despite a clean build, seen on this project. If it's already correct, this may be the (currently open, unresolved) Next.js 16 + Turbopack + Vercel issue several people have hit; the fallback is forcing webpack: `"build": "next build --webpack"` in `frontend/package.json`. |

---

## 9. Production deployment

This section is about the **live, deployed** instance — Neon + Render + Vercel.
It's additive to everything above: local dev (sections 1-8) works exactly the
same regardless of what's deployed, and nothing here changes how you develop
locally. Skip this section unless you're touching the deployed environment
itself (redeploying, rotating a secret, debugging a prod-only issue).

### What's deployed where

| Piece | Host | URL | Notes |
|---|---|---|---|
| Frontend | Vercel | https://autoresttest.vercel.app | Root Directory `frontend`, Next.js framework preset, env: `NEXT_PUBLIC_API_BASE_URL` |
| Backend | Render — Web Service, Node | https://autoresttest-backend.onrender.com | Root Directory `backend`; build `npm ci && npx prisma generate && npm run build`; start `npm run start:prod` |
| engine-service | Render — Web Service, Docker | https://autoresttest.onrender.com | Built from the repo-root `Dockerfile`; single instance, no autoscaling, no persistent disk (free tier) |
| Database | Neon (Postgres) | — | Same DB as local dev — see the warning below |

All three app services auto-deploy on push to `main` (both Render and Vercel
watch the GitHub repo directly — no manual trigger needed for routine changes).

> **This Neon database is shared with local dev.** `backend/.env` locally and
> the backend's `DATABASE_URL` on Render point at the *same* Neon instance —
> there is no separate staging DB. Real user data lives there. Never run
> `prisma migrate reset`, `db push --force-reset`, or similar against it.

### The engine-service Docker image

Why it needs its own image at all: `autoresttest-core` requires Python
**exactly** 3.10.x and `OOPS-final` requires Python **>=3.12** — genuinely
incompatible interpreters, both invoked as subprocesses of the same
engine-service process. No buildpack can satisfy that; a multi-stage
`Dockerfile` (repo root) does, building each tool's venv in its own
same-version stage and combining them in a final `python:3.12-slim-bookworm`
image alongside a JRE (for OOPS's Swagger→OAS3 upgrade step).

The one genuinely tricky part, documented inline in the Dockerfile itself: a
venv's `bin/python` is an *absolute* symlink to the **generic, unversioned**
`/usr/local/bin/python` of whatever base image created it — not to
`python3.10` specifically. That's harmless in the stage that builds it
(`python:3.10-slim-bookworm`, where the generic name already means 3.10) but
silently wrong once cross-copied into the 3.12-based final stage, where the
generic name now means 3.12. The fix is to explicitly relink
`/opt/venvs/core/bin/python*` to the versioned `python3.10` binary after
copying it in. If you ever touch this Dockerfile, re-verify with:

```bash
docker build -t autoresttest-engine:local -f Dockerfile .
docker run --rm autoresttest-engine:local /opt/venvs/core/bin/python -c \
  "import numpy, scipy, gensim, sklearn; print('core ok')"
docker run --rm autoresttest-engine:local /app/OOPS-final/.venv/bin/python -c \
  "import agno, httpx, networkx, openai; print('oops ok')"
```

Both must print their "ok" line — a broken cross-copy fails silently at
*runtime*, not at `docker build` time, so `docker build` succeeding proves
nothing on its own.

### Free-tier trade-offs (reversible later)

- **No persistent disk.** `JOBS_DIR` and `autoresttest-core/data/<spec>/`
  (the spec-hash cache) live on the container's ephemeral filesystem and are
  wiped on every restart/redeploy. Completed job results aren't affected —
  the backend persists those to Postgres independently — but a run active
  during a restart is lost, and every spec pays its full graph/Q-table build
  cost again instead of hitting cache. If this ever moves to a paid Render
  plan, attach one disk mounted at `/app/autoresttest-core/data` (the
  hardcoded path `jobs.py` already writes into) and set
  `JOBS_DIR=/app/autoresttest-core/data/engine-jobs` to put both under it.
- **engine-service is a public Web Service, not a Render Private Service**
  (paid-plan-only). Its `/proxy/<job_id>` route is unauthenticated by design
  (it's the recording proxy a running test's own subprocess calls back into,
  never meant to be called from outside) — accepted risk, since `job_id` is
  an unguessable UUID and the exposure window is bounded by the run's time
  budget. Every other route requires `SERVICE_TOKEN`/`X-Service-Token`.

### Env vars and secrets

Set directly in each service's dashboard (Render → Environment tab, Vercel →
Project Settings → Environment Variables) — nothing production-specific is
committed to the repo. `backend/.env.example` and `engine-service/.env.example`
are the authoritative var lists; cross-check against those, not this doc, if
they ever drift.

Two pairs must be byte-identical across services or auth breaks:

- `SERVICE_TOKEN` (engine-service) ↔ `ENGINE_SERVICE_TOKEN` (backend)
- `ENGINE_SERVICE_URL` (backend) must be engine-service's exact public URL

Reports' LLM key (`LLM_API_KEY`) and the engine's own `API_KEY` are both
intentionally left blank in the platform's env config in favor of the
already-built admin UI: log in as one of the `ADMIN_EMAILS` and set/rotate
real keys live at `/admin/llm-settings`, per scope (`TEST_ENGINE` /
`SPEC_GENERATION` / `REPORT_EXPLANATION`), with no redeploy needed.

### Redeploying / applying a migration

Routine deploys need no manual step — push to `main`. For a schema change
specifically:

```bash
# Author the migration locally as usual against your dev setup, then:
cd backend
DATABASE_URL="<neon-pooled-url>" npx prisma migrate deploy
```

Run this once manually per schema change (or wire it as Render's **Pre-Deploy
Command**: `npx prisma migrate deploy`, which then runs automatically before
every future deploy that has one). Always `migrate deploy`, never `migrate
dev` or `migrate reset`, against this database.

### Debugging a live issue

- **Backend / engine-service logs** — Render dashboard → the service → Logs
  tab (live tail) or Shell tab (for one-off commands, e.g. `curl
  localhost:5000/health` from inside engine-service).
- **Frontend build/runtime issues** — Vercel dashboard → the deployment →
  Build Logs / Runtime Logs.
- **`GET /health`** on engine-service and **`GET /`** on the backend are both
  unauthenticated and safe to `curl` directly as a first check that a
  service is actually up.
