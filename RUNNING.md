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
| `OOPS-core/` | Python ≥3.12 (uv) | — | invoked by engine-service |

`autoresttest-core` and `OOPS-core` are **not** started by hand — engine-service
shells out to them per job. You only install their dependencies.

Start order: **engine-service → backend → frontend**.

---

## 1. One-time setup

### Prerequisites

- Node.js 18+
- Python 3.11 (engine-service), Python 3.10 (autoresttest-core), Python 3.12+ (OOPS-core)
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
```

The `OOPS_*` settings default correctly for this repo layout; only change them
if OOPS-core lives elsewhere or you want a different generation model.

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
cd ../OOPS-core && uv sync
```

`OOPS-core` defaults to the Tsinghua PyPI mirror. If that is slow, override it:

```bash
uv sync --index-url https://pypi.org/simple
```

---

## 2. Daily run — three terminals

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
- **Spec generation** calls `OOPS-core`, which reads the whole codebase with an
  LLM. This takes **minutes to hours** depending on file count. Exclude
  vendored directories in the UI to cut this down sharply.

Both need a working `API_KEY` and `LLM_API_BASE`.

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
| Spec generation fails instantly | Check `jobs/<id>/error.txt`. Usually a missing `API_KEY`, or `OOPS_PYTHON` pointing at a venv that hasn't been created with `uv sync`. |
| Archive rejected on upload | The zip is corrupt, over 50 MB, over 5000 files, or expands past 200 MB. Exclude `node_modules`/`venv`/build output before zipping. |
| `Cannot find module dist/main` | The build emits `dist/src/main.js`. Use `node dist/src/main`. |
| Port already in use | Change `PORT` in the relevant `.env` (and `ENGINE_SERVICE_URL` / `NEXT_PUBLIC_API_BASE_URL` to match). |
