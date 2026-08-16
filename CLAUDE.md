# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

AutoRestTest is an AI-powered platform for automated REST API testing. The repo is a **monorepo of independent subprojects** that are developed and run separately (each has its own dependencies, build, and lockfile):

- **`autoresttest-core/`** — the Python testing engine. Parses an OpenAPI 3.0 spec, builds a semantic dependency graph between operations, and drives request generation with multi-agent reinforcement learning (MARL/Q-learning) plus LLM-backed value generation. This is the underlying research tool; the backend/frontend wrap it into a SaaS product.
- **`OOPS-core/`** — a second, unmodified research tool: an LLM pipeline that reads a REST API project's **source code** and generates an OpenAPI spec for it. Vendored as-is — do not edit it. The platform drives it through `engine-service/oops_worker.py`.
- **`engine-service/`** — Flask + waitress microservice that wraps both Python tools behind an async-job HTTP API (`/runs` for test runs, `/generations` for spec generation) and records engine traffic through a reverse proxy.
- **`backend/`** — NestJS 11 + Prisma 7 + PostgreSQL REST API. The platform's application server (auth, projects, specs, endpoints, test suites, reports, collaboration).
- **`frontend/`** — Next.js 16 + React 19 + Tailwind CSS 4 web client.

Each subproject has its own agent docs — **read them before working in that subproject**:
- `autoresttest-core/CLAUDE.md` — full architecture of the Python engine (pipeline phases, the seven Q-learning agents, caching, config).
- `OOPS-core/CLAUDE.md` — architecture of the spec-generation pipeline (partly stale: it references a `main.py` and `core/ablate.py` that are absent).
- `frontend/AGENTS.md` (referenced from `frontend/CLAUDE.md`) — **critical:** this is a non-standard Next.js version with breaking changes; consult `node_modules/next/dist/docs/` before writing frontend code rather than relying on training data.

There is no root-level package manager or workspace tool — `cd` into the relevant subproject directory to run any command.

## Commands

### backend/ (NestJS)
```bash
npm install
npm run start:dev        # watch-mode dev server (default http://localhost:3000)
npm run build            # nest build -> dist/
npm run start:prod       # node dist/main
npm run lint             # eslint --fix
npm run format           # prettier --write
npm test                 # jest unit tests (*.spec.ts under src/)
npm test -- projects     # run a single test file / pattern
npm run test:e2e         # jest with test/jest-e2e.json
npm run test:cov         # coverage

# Prisma (run from backend/)
npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma generate                    # regenerate the client into generated/prisma/
npx prisma studio                      # DB browser
```

### frontend/ (Next.js)
```bash
npm install
npm run dev              # next dev
npm run build            # next build
npm run lint             # eslint
```

### autoresttest-core/ (Python) — see autoresttest-core/CLAUDE.md for full detail
```bash
poetry install
poetry run autoresttest                 # interactive TUI + config wizard
poetry run autoresttest --skip-wizard   # use configurations.toml directly
```

### engine-service/ (Flask)
```bash
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python wsgi.py            # serves on PORT (default 5000)
.venv/Scripts/python -m pytest -q       # tests (all run in mock mode)
```
Set `ENGINE_MODE=mock` in `engine-service/.env` to exercise both job types
offline in seconds — no LLM key, no engine, no OOPS run. This is the fast loop
for anything touching the backend or frontend job flows.

**Why a real run takes far longer than its `timeBudget`.** The budget bounds
only the engine's MARL loop (phase 4). Graph construction and Q-table
initialization are explicitly *not* time-bounded and cost two LLM calls per
operation — on a queued free tier (NVIDIA NIM at ~2-4 min/call) that alone is
tens of minutes before the first timed request. Three things keep it in hand,
all in `runner.py`/`jobs.py`: `ENGINE_VALUE_WORKERS` parallelizes those calls
(the core's `LLM_RPM_LIMIT` throttle, not the worker count, is what protects the
provider); `ENGINE_USE_CACHE` reuses the graph and Q-tables so a second run of
the same spec skips both phases; and the spec is named `spec_<sha256>` rather
than per-job, because the engine keys those caches on the spec file's stem — a
per-job name meant a guaranteed cache miss every time. The flip side is that
`autoresttest-core/data/<spec_name>/` is now shared between runs of the same
spec, so `jobs.py` clears it before each run.

**Killing a run must kill the tree.** The engine is launched with `Popen` into
its own process group, output redirected to `jobs/<id>/stdout.log`, and killed
via `taskkill /T` (POSIX: `killpg`). Neither detail is cosmetic: `poetry run`
puts three processes above the engine, so `subprocess.run(timeout=)` killed only
the wrapper and orphaned an engine that kept hammering the target API — and then
hung forever, because its post-kill `communicate()` waits on pipe handles the
orphans still hold. Prefer `ENGINE_CMD=<venv>/python -m autoresttest.autoresttest`
over `poetry run` to avoid the extra layers entirely.

## Spec generation from source code (OOPS)

A project's OpenAPI spec can either be uploaded as a file or **generated from a
zip of the API's source**. The generated document is parked for review and only
becomes the project's spec when the user explicitly applies it, so generation
never silently replaces a spec or wipes endpoints.

Flow: `frontend spec page → POST /projects/:id/spec/generate (multipart zip) →
engine-service POST /generations → OOPS venv subprocess → openapi.json →
backend polls and stores it on SpecGeneration → user reviews → POST
/spec/generate/apply → SpecsService.persistSpec(..., generatedByAI: true)`.

Things to know before touching this path:

- **`OOPS-core/` is never modified.** `engine-service/oops_worker.py` is the
  single point of contact with `core.*`. It runs under OOPS's own venv
  (`OOPS_PYTHON`, Python ≥3.12) because autoresttest-core is on 3.10.
- **Generation has its own queue and worker thread** (`GenerationManager`),
  separate from `JobManager`. Test runs are serialized because the engine reads
  one global `configurations.toml`; a multi-hour generation must not block them.
- **A JRE is required for best results.** OOPS upgrades its Swagger 2.0 output
  to OAS 3.x by shelling out to `java -jar codegen-3.0.68.jar`. Without `java`
  on PATH the run still completes, but falls back to the raw Swagger 2.0
  payload, which the backend converts with `swagger2openapi` at lower schema
  fidelity (no hoisting into `#/components/schemas`). The job carries a warning
  when this happens. Install Temurin 17+ to avoid it.
- **Uploads are untrusted input.** `GenerationManager._extract` rejects
  zip-slip paths, symlinks, oversized expansions, and excessive file counts —
  these are the only guard between an upload and an arbitrary host write.
  Separately, OOPS hands the LLM a `run_command` shell tool scoped to the
  extracted tree (`FileHandler`, `enable_run_command=True`); it is the agents'
  only tool and cannot be disabled without degrading the pipeline, so treat
  engine-service as a trusted single-tenant host or containerize it.
- Generation is slow (hours on a mid-size backend) and LLM-bound. Watch
  `engine-service/jobs/<id>/stdout.log` and `progress.json` while a run is live.

## Backend architecture & conventions

The backend has no per-subproject CLAUDE.md, so the important bits live here.

**Bootstrap (`src/main.ts`):** a single global `ValidationPipe` is applied with `whitelist`, `forbidNonWhitelisted`, and `transform` on — every incoming payload is validated against its DTO and unknown fields are rejected. Port comes from `PORT` env (default 3000).

**Module layout:** `AppModule` wires `ConfigModule.forRoot({ isGlobal: true })` (env available everywhere via `ConfigService`/`process.env`), the global `PrismaModule`, then feature modules. Each feature is a folder under `src/<feature>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts`, and a `dto/` directory. Controllers stay thin and delegate all logic to services.

**Prisma (Prisma 7):** the client is generated to **`backend/generated/prisma/`** (not `node_modules`) — import models/enums/`Prisma` from `'../../generated/prisma/client'`, not `@prisma/client` directly. `PrismaService` (`src/prisma/prisma.service.ts`) extends the generated `PrismaClient` and **requires a `PrismaPg` driver adapter built from `DATABASE_URL`** at construction (the legacy implicit `datasource.url` flow is gone). It implements `OnModuleInit`/`OnModuleDestroy` to connect/disconnect. `PrismaModule` is `@Global`, so inject `PrismaService` anywhere without re-importing. After editing `prisma/schema.prisma`, run `npx prisma generate`.

**Data model (`prisma/schema.prisma`):** `User` → owns many `Project`; `Project` ↔ `User` many-to-many through `ProjectMember` (carries a `Role` enum: `admin | tester | viewer`). `ProjectMember` cascade-deletes with its `Project`. Tables are snake_cased via `@@map`. IDs are UUID strings.

**Auth (`src/auth/`):** JWT bearer auth via `passport-jwt`. `JwtStrategy.validate` **re-fetches the user from the DB on every protected request** (so deleted/revoked accounts are rejected immediately) and attaches the user to `request.user`. Protect routes with `@UseGuards(JwtAuthGuard)` — applied per-controller (e.g. `ProjectsController`) or per-route (e.g. `GET /auth/me`); `register`/`login` are left public. Passwords are bcrypt-hashed (10 rounds). Tokens are signed with `JWT_SECRET`, 7-day expiry.

**Service-layer conventions worth matching when adding modules:**
- Use the Nest HTTP exceptions for control flow: `NotFoundException` (404), `ForbiddenException` (403), `ConflictException` (409), `BadRequestException` (400), `UnauthorizedException` (401).
- Always use `select` projections in Prisma queries — never return the password hash; define explicit return-shape interfaces (e.g. `PublicUser`, `ProjectListItem`, `ProjectDetail`) next to the service.
- Catch `Prisma.PrismaClientKnownRequestError` and branch on `err.code` (`P2002` unique violation, `P2025` record-not-found) to translate DB errors into the right HTTP exception; keep a pre-check + race-condition fallback pattern (see `AuthService.register`).
- Wrap multi-row writes that must be atomic in `prisma.$transaction` (see `ProjectsService.create`).
- For auth-checked mutations, an `updateMany`/`deleteMany` filtered by ownership doubles as the existence+permission check; distinguish 404 vs 403 only when needed.
- Validate `:id` path params with `new ParseUUIDPipe()`.

**Env vars (backend, see `.env.example`):** `DATABASE_URL` (Postgres connection string), `JWT_SECRET`, `PORT`. Both `PrismaService` and `JwtStrategy` throw clear errors at startup if their required var is missing. Prisma CLI reads `DATABASE_URL` via `prisma.config.ts` (`dotenv/config`).

**Accounts (`src/auth/` + `src/users/`):** identity is split across two modules on
purpose. `auth/` owns everything that establishes a session — register, login,
email verification, password reset — and `users/` owns what a signed-in user
does to their own account (profile, password change, notification preferences,
deletion). Reads stay on `GET /auth/me`, the frontend's bootstrap call, so there
is only ever one "who am I" endpoint. The shared `PublicUser` shape and
`PUBLIC_USER_SELECT` live in `users/user.types.ts` rather than in either
service, because `JwtStrategy` needs them and must not import the service it
guards.

Four things here are easy to break:

- **`login` takes `identifier`, not `email`** — one field accepting either an
  email address or a username. They are told apart by the `@`, which usernames
  forbid. That also makes the **username immutable**: `PATCH /users/me` accepts
  only `name` and `avatarColor`, and the global `forbidNonWhitelisted` pipe
  turns an attempt at `username`/`email` into a 400 for free.
- **`passwordChangedAt` is the app's only session revocation.** `JwtStrategy`
  rejects any token whose `iat` predates it. Compare **whole seconds** on both
  sides — `iat` has one-second resolution, and comparing it against the
  millisecond timestamp rejects the token minted by "reset, then sign in".
- **Every `User` row is verified — rely on this.** `POST /auth/register` does
  **not** create an account. It writes a `PendingSignup` (email unique,
  password already hashed, sha256 of a six-digit code) and returns a message,
  no session. `POST /auth/verify-signup` — public, because there is no account
  to authenticate against yet — validates the code, creates the user inside a
  transaction, deletes the pending row, and returns `{ accessToken, user }` in
  the same shape as login.
  This exists because the earlier design created the row up front, and
  `User.email` is unique: **registering with an address you did not own claimed
  it permanently.** An unproven address must never reserve anything.
  The anti-squatting mechanism is one line — `pendingSignup.upsert` keyed on
  email, so a second registration *overwrites* the first. Whoever can read the
  inbox wins. Do not "fix" that into a 409.
  A consequence worth keeping in mind: there is no unverified state to guard,
  so `EmailVerifiedGuard`, `mustVerifyEmail` and the client-side wall are all
  gone. Do not reintroduce a route guard for verification — closing the old
  `POST /invitations/:token/accept` hole needed no guard, just the absence of
  unverified accounts. `REQUIRE_EMAIL_VERIFICATION=false` skips the pending
  step entirely and creates the account outright (marked verified, since with
  the check off it never otherwise could be).
- **Rate limiting is per-controller, never global.** `ThrottlerModule.forRoot`
  is registered with **no `APP_GUARD`**; `ThrottlerGuard` is applied on
  `AuthController` and `UsersController` only. A global limit would also cover
  the run-status and graph endpoints the frontend polls every three seconds.
  `main.ts` sets `trust proxy` so the limits are per-caller behind Render.

`AuthToken` (one table, both flows) stores a **sha256 of the secret**, unlike
`ProjectInvitation`, which stores its token in plaintext because it is meant to
be copied out of the UI. Reset tokens are looked up by hash; six-digit codes are
looked up by `(userId, type)` and only then hash-compared, since two users can
legitimately hold the same code. The attempt counter, not the TTL, is what makes
a six-digit code safe — it burns the row at five wrong guesses.

**Email (`src/email/`):** transactional mail goes through Resend — an HTTPS API, chosen because Render's free tier blocks outbound SMTP, so a Nodemailer/SMTP setup would work locally and then fail in deployment. `EmailService` is `@Global` and sends three messages: project invitation (on create and on `POST …/invitations/:id/resend`), welcome on registration, and run-finished from the test-suite poller. Two things to know: **`send()` never throws** — it returns a boolean, because none of its callers should fail when mail does, and two of them run in a background poller with no request to fail into; and **`EMAIL_MODE=mock` (the default) logs the rendered message to the console** and never touches the network, mirroring `LLM_MODE`. Set `EMAIL_DEV_REDIRECT_TO` to demo real sends — Resend refuses recipients other than your own account address until a domain is verified. Templates live in `email/templates.ts` as pure functions; everything interpolated is HTML-escaped and all styling is inline, since mail clients strip stylesheets.
