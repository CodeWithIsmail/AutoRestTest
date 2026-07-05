# AutoRestTest

**An AI-powered platform for automated REST API testing.**

AutoRestTest takes an OpenAPI 3.0 specification, builds a semantic dependency
graph between operations, and drives request generation with multi-agent
reinforcement learning (MARL / Q-learning) plus LLM-backed value generation —
then surfaces the results (coverage, status-code distribution, server errors,
and the full request/response of every call it made) through a web app.

This repository is a **monorepo of four independent subprojects**. Each has its
own dependencies, lockfile, and run commands — there is no root-level package
manager or workspace tool. `cd` into a subproject to work on it.

| Subproject | Stack | Port | Role |
|------------|-------|------|------|
| [`autoresttest-core/`](autoresttest-core) | Python 3 · Poetry | — | The research testing engine (black box). Parses the spec and generates/executes requests. |
| [`engine-service/`](engine-service) | Flask · Waitress | `5000` | Async-job HTTP wrapper around the engine. Runs one job at a time in a background thread. |
| [`backend/`](backend) | NestJS 11 · Prisma 7 · PostgreSQL | `3000` | Application API — auth, projects, specs, test suites, request logs, reports. |
| [`frontend/`](frontend) | Next.js 16 · React 19 · Tailwind 4 | `3001` | Web client. |

### Request flow

```
Browser
  │
  ▼
Next.js frontend (3001)
  │  REST + JWT
  ▼
NestJS backend (3000) ───────▶  NeonDB / PostgreSQL (cloud)
  │  async-job HTTP
  ▼
Flask engine-service (5000)
  │  subprocess (poetry run autoresttest)
  ▼
autoresttest-core  ──── HTTP requests ───▶  Target API under test (e.g. 8080)
```

The engine's outbound traffic is routed through a **recording proxy** inside
engine-service, so every request/response the engine sends to the target API is
captured and shown to the user — without modifying the core.

---

## Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.10+ and **Poetry** (for `autoresttest-core`)
- **PostgreSQL** — this project is configured against a cloud **NeonDB**
  instance via `DATABASE_URL`; no local database process is required. A local
  Postgres works too if you point `DATABASE_URL` at it.
- An **OpenRouter API key** (or any OpenAI-compatible endpoint) for real engine
  runs. Not needed for `mock` mode.

---

## Environment files

Copy each `.env.example` to `.env` and fill in real values. Two already exist
in this checkout (`backend/.env`, `autoresttest-core/.env`); create the other
two if you don't have them.

| File | Key settings |
|------|--------------|
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET`, `PORT=3000`, `ENGINE_SERVICE_URL=http://127.0.0.1:5000` |
| `engine-service/.env` | `ENGINE_MODE=real`\|`mock`, `LLM_ENGINE`, `CORE_DIR=../autoresttest-core`, `PORT=5000` |
| `frontend/.env` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000` |
| `autoresttest-core/.env` | OpenRouter/LLM `API_KEY` and (optional) `JWT_TOKEN` used by the engine itself |

> `engine-service/.env` is loaded at startup, so you can set `ENGINE_MODE`,
> `LLM_ENGINE`, `API_KEY`, etc. there permanently instead of exporting `$env:`
> vars on every launch. Real shell environment variables still take precedence.

> Use `127.0.0.1` (not `localhost`) for `ENGINE_SERVICE_URL` so Node's fetch
> doesn't resolve to IPv6 `::1`.

---

## One-time setup

```powershell
# 1. autoresttest-core (Python engine)
cd autoresttest-core
poetry install

# 2. engine-service (Flask wrapper)
cd ..\engine-service
python -m venv .venv            # skip if .venv already exists
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. backend (NestJS + Prisma)
cd ..\backend
npm install
npx prisma generate             # generate client into generated/prisma/
npx prisma migrate deploy       # apply migrations to the database

# 4. frontend (Next.js)
cd ..\frontend
npm install
```

---

## Running the project

Start the services in this order, **each in its own terminal**.

### 1. engine-service — port 5000

```powershell
cd engine-service
.\.venv\Scripts\Activate.ps1
python wsgi.py                   # reads engine-service/.env (ENGINE_MODE, LLM_ENGINE, …)
```

> Set `ENGINE_MODE` (`real`|`mock`) and `LLM_ENGINE` in `engine-service/.env`.
> To override for a single launch without editing the file, export first, e.g.
> `$env:ENGINE_MODE = "mock"; python wsgi.py` — shell vars win over `.env`.

### 2. backend — port 3000

```powershell
cd backend
npm run start:dev               # watch-mode dev server
```

### 3. frontend — port 3001

```powershell
cd frontend
npm run dev
```

### 4. Your target API — port 8080

Start whatever REST API you want to test. Its base URL (e.g.
`http://localhost:8080`) is what you enter when creating a test suite.

Then open **http://localhost:3001**, register an account, create a project,
upload an OpenAPI spec, and run a test suite.

> **Mock mode:** set `ENGINE_MODE=mock` in `engine-service/.env` (or
> `$env:ENGINE_MODE = "mock"` for one launch) to exercise the whole UI
> lifecycle offline — no LLM key, no target API, no multi-minute wait. The
> service returns canned engine output.

---

## Common commands

### backend/ (NestJS)

```bash
npm run start:dev        # watch-mode dev server
npm run build            # nest build -> dist/
npm run start:prod       # node dist/src/main
npm run lint             # eslint --fix
npm test                 # jest unit tests
npm run test:e2e         # end-to-end tests

npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma generate                    # regenerate the client
npx prisma studio                      # DB browser
```

### frontend/ (Next.js)

```bash
npm run dev              # next dev -p 3001
npm run build            # next build
npm run lint             # eslint
```

### engine-service/ (Flask)

```bash
python wsgi.py           # serve on $PORT (default 5000)
python -m pytest -q      # tests (run in mock mode; no LLM key needed)
```

### autoresttest-core/ (Python) — see `autoresttest-core/CLAUDE.md`

```bash
poetry run autoresttest                 # interactive TUI + config wizard
poetry run autoresttest --skip-wizard   # use configurations.toml directly
```

---

## Troubleshooting

- **Frontend 404 on a page that should exist** — Next.js 16 on Windows
  sometimes fails to register newly-added route folders while running. Stop the
  dev server, delete `frontend/.next`, and restart `npm run dev`.
- **`Cannot find module dist/main`** — the compiled entrypoint is at
  `dist/src/main.js`; use `node dist/src/main`.
- **Prisma `requestLog does not exist` (or similar)** — run `npx prisma generate`
  after any schema change or fresh checkout.
- **Engine run fails immediately** — confirm `autoresttest-core` has `poetry
  install` done and a valid LLM key in `autoresttest-core/.env`. Restarting
  engine-service loses in-flight jobs (in-memory registry).
- **Poor test results (many 400/404)** — check the engine's `recursion_limit`
  (spec `$ref` expansion depth); too low yields shallow request bodies and a
  weak dependency graph.

---

## Further reading

Each subproject has its own agent/architecture docs — read them before working
in that subproject:

- `CLAUDE.md` — repo-wide guidance and backend architecture/conventions.
- `autoresttest-core/CLAUDE.md` — full engine architecture (pipeline phases,
  the seven Q-learning agents, caching, config).
- `engine-service/README.md` — the async-job HTTP API and result shape.
- `frontend/AGENTS.md` — **critical:** this is a non-standard Next.js version
  with breaking changes; consult `node_modules/next/dist/docs/` rather than
  relying on training data.

Research basis: *AutoRestTest* (ICSE 2025), see `resources/paper/`.
