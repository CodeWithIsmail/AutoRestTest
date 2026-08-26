# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

AutoRestTest is an AI-powered platform for automated REST API testing. The repo is a **monorepo of independent subprojects** that are developed and run separately (each has its own dependencies, build, and lockfile):

- **`autoresttest-core/`** — the Python testing engine. Parses an OpenAPI 3.0 spec, builds a semantic dependency graph between operations, and drives request generation with multi-agent reinforcement learning (MARL/Q-learning) plus LLM-backed value generation. This is the underlying research tool; the backend/frontend wrap it into a SaaS product.
- **`OOPS-final/`** — a second, unmodified research tool: an LLM pipeline that reads a REST API project's **source code** and generates an OpenAPI spec for it. Vendored as-is — do not edit it. The platform drives it through `engine-service/oops_worker.py`.
- **`engine-service/`** — Flask + waitress microservice that wraps both Python tools behind an async-job HTTP API (`/runs` for test runs, `/generations` for spec generation) and records engine traffic through a reverse proxy.
- **`backend/`** — NestJS 11 + Prisma 7 + PostgreSQL REST API. The platform's application server (auth, projects, specs, endpoints, test suites, reports, collaboration).
- **`frontend/`** — Next.js 16 + React 19 + Tailwind CSS 4 web client.

Each subproject has its own agent docs — **read them before working in that subproject**:
- `autoresttest-core/CLAUDE.md` — full architecture of the Python engine (pipeline phases, the seven Q-learning agents, caching, config).
- `OOPS-final/CLAUDE.md` — architecture of the spec-generation pipeline.
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

- **`OOPS-final/` is never modified.** `engine-service/oops_worker.py` is the
  single point of contact with `core.*`. It runs under OOPS's own venv
  (`OOPS_PYTHON`, Python ≥3.12) because autoresttest-core is on 3.10. Spec
  generation uses its own dedicated LLM credentials (`OOPS_API_KEY` /
  `OOPS_LLM_API_URL`, mapped by `oops_runner.oops_env()` into the `LLM_API_KEY`
  / `LLM_API_URL` names OOPS reads) — separate from the main engine's
  `API_KEY` / `LLM_API_BASE`, so spec generation can run against a different
  provider than test-generation. The current default is Gemini 3.5 Flash Lite
  via its OpenAI-compatible endpoint, measured at ~15-20 min end-to-end versus
  1h+ on the earlier NVIDIA NIM/nemotron setup.
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

## Dependency graph (SPDG) visualization

The engine's defining feature — the Semantic Property Dependency Graph — used to
be invisible, built in phase 2 of every run and never leaving the engine host.
It is now surfaced on a project tab (static, spec-derived) and on each completed
run (static plus the MARL Q-values layered over it).

The pipeline: `autoresttest-core` writes `data/<spec>/graph.json` and
`dependency_q_table.json` → `engine-service` returns them on the run result
**and** can build one standalone via `POST /graphs` → the backend merges the two
halves in `src/graph/graph-merge.ts` → the frontend draws it as hand-rolled
inline SVG (`components/graph/`).

**What is drawn is not what the engine exports.** `graph.json` is a *candidate*
set: the comparator's 0.8 similarity threshold over field names matches almost
everything against almost everything, so it is quadratic — 19 operations give
149 edges, 76 give 2,589, 145 give 16,598. Drawn whole it is a hairball, and no
layout rescues it; the first version of this view shipped a circular layout and
an adjacency matrix precisely because the layered drawing was unreadable, and
those were unreadable too.

The engine never uses that set. `DependencyAgent.get_best_action`
(`agents/dependency_agent.py`) walks each consumer parameter and takes the
single highest-Q producer. So `graph-merge.ts` **resolves** the candidates the
same way — one winner per (consumer, parameter), grouped into one edge per
(producer, consumer) pair — and the result is sparse and nearly acyclic: those
same specs give 20, 69 and 372 edges, with 2, 2 and 29 cycles. That is what
makes a layered drawing the right answer rather than a compromise, and it is why
there is now exactly one view.

Things that will bite whoever touches this next, each one a bug that was
actually hit:

- **Edge direction is stored backwards from how it reads.**
  `add_operation_edge(operation_id, dependent_operation_id)` means "this
  operation's parameters can be filled from that one's response" — consumer →
  producer. `graph-merge.ts` flips it **exactly once** so `from` is the producer
  and arrows read as execution order. Nothing downstream re-flips.
- **Export from `operation_nodes[*].outgoing_edges`, not the flat
  `operation_edges` list.** `determine_dependencies` promotes tentative edges
  into the per-node list and never appends them to the flat one, and the
  Dependency Agent reads the per-node list — iterate the flat list and the graph
  disagrees with the Q-table.
- **Phantom edges exist.** `update_operation_dependencies` creates an edge
  whenever `similar_parameters` is a non-empty dict, even when every value is an
  empty list. The exporter skips those; the sample API has 48 raw edges and 40
  real ones.
- **The export call sits outside the `shelve` block on purpose.** With
  `ENGINE_USE_CACHE=true` the cache hit is the common path, so exporting inside
  the rebuild branch would silently produce nothing on almost every run.
- **`graph_worker.py` writes to `jobs/<id>/graph.json`, never
  `data/<spec_name>/`** — `jobs.py` rmtree's that directory before every run.
  It also must not touch the shelve cache: `dbm` is not concurrency-safe and a
  test run may be holding it.
- **Resolution's tie-break is doing most of the work.** Similarity is capped at
  1.0 and the threshold is 0.8, so ties at the maximum are the norm, not the
  exception — 118 of 119 parameters on a 76-operation spec. `better()` breaks
  them toward `producedIn: 'response'`: a value the producer *returns* is a data
  dependency, while a `params` match only means two operations accept a
  similarly named argument. Ranking by producer id alone would have produced an
  arbitrary picture that still looked plausible.
- **Response-only filtering is not a substitute for the tie-break.** Two of the
  sample specs document no response schemas at all, and filtering to
  `producedIn: 'response'` empties their graphs entirely.
- **Layered layout degenerates on dense graphs.** After cycle-breaking, a
  near-complete graph's precedence relation is a total order, so longest-path
  layering produces one node per layer. `layout.ts` falls back to BFS depth past
  a threshold. Resolution makes this rare rather than impossible, so the
  fallback stays.
- **Ranks are wrapped, not stacked.** REST specs are shallow and wide — a rank
  can hold 33 of 52 nodes while the graph is four ranks deep — and stacked
  literally that is a tall ribbon inside a short, wide card. An over-full rank
  spills into adjacent slots, which keeps the whole rank between its neighbours
  and so changes nothing about the precedence reading.
- **Paths are truncated from the front.** `…/gasrecords/delete`, not
  `/api/vehicle/gasrec…`. Half a spec shares one prefix, so trimming the tail
  renders a dozen distinct operations as the same string.
- **Weight labels are their own SVG layer, above every curve.** Drawn inside
  each edge's group, a later edge's stroke paints over an earlier edge's pill —
  exactly where curves are densest and the number is most needed.
- **Back edges are real information, not a rendering artifact.** They are
  dependency cycles, inherent to symmetric field-name matching. They are drawn
  dotted and bowed over or under, anchored to node faces rather than centres.
- **Old run snapshots hold the unresolved shape.** `TestSuite.dependencyGraph`
  stores the merged payload, so runs from before this change hold every
  candidate. `upgradeStoredGraph` re-resolves anything below `schema: 2` on
  read — the v1 `matches` carry every field resolution needs. Both read paths
  (project row and suite snapshot) go through it.

## Test-case descriptions ("Explain requests")

Every captured request can carry a one-sentence plain-language description of
what it tests — "Test with an empty title field" — shown in the Description
column of a run's request list. It is a readability layer, nothing more.

**The engine is not involved, and neither is the run.** `autoresttest-core/` and
`engine-service/` are untouched; testing proceeds exactly as before. Descriptions
are written *afterwards*, only when a user presses **Explain requests** on a
completed run, which hands the stored requests to the LLM in small batches.
Nothing is written at ingest, so `RequestLog.description` is null until someone
asks.

The whole feature is three pieces: `LlmService.describeRequests()`
(`src/reports/llm.service.ts`), `RequestDescriptionsService`
(`src/test-suites/request-descriptions.service.ts`), and
`POST /projects/:id/test-suites/:suiteId/describe`. `TestSuitesModule` imports
`ReportsModule` for the LLM client alone — same `REPORT_EXPLANATION` credentials
as the failure explainer.

**What the model is shown decides how specific the output is.** Three things
were added after the first version produced only generic sentences, and each is
load-bearing:

- **The templated path.** `RequestLog.path` is *concrete* (`/pets/%20fluffy%20`);
  the template `/pets/{slug}` lives on the joined `Endpoint`. Without it the
  model cannot know which segment is a parameter or what it is called, so
  "leading and trailing spaces for 'path_params.slug'" is not unlikely — it is
  unavailable. The prompt therefore sends the request *decomposed*
  (`path_params`, `query_params`, `headers`, `body`), since binding values to
  names is deterministic work that should not be left to inference. A null
  `endpointId` is itself a finding: logs match on `METHOD:templatedPath`, so an
  unmatched row means the method was mutated.
- **The declared schema.** `spec-params.ts` parses and dereferences the project
  spec once per invocation and indexes each operation's parameter types,
  `required`, and constraints (`maxLength`, `enum`, `format`, …). It never
  throws — an unparseable spec degrades the descriptions rather than failing the
  pass.
- **The engine's mutation vocabulary.** `MutationAgent.mutate_values`
  (`marl.py:350`) applies a fixed, small set: wrong type (65%), boundary values
  (25%, from a literal list), parameter rename/relocate (10%), auth-token
  drop/fuzz (20%), media-type swap (2%), wrong HTTP method (1%). Listing those
  in the system prompt turns open-ended writing into near-classification, which
  is what makes output *consistent* across a run rather than merely fluent.

The response is deliberately **not** sent. Shown a status code, the model drifts
into describing the outcome ("Verifies the API returns 400") instead of the
intent; a test case's description should read the same whether it passed or
failed. `Authorization` is reduced to `present`/`absent` so no credential leaves
the deployment.

Three design points worth keeping:

- **The pass is bounded and resumable, not one long request.** A call runs until
  `LLM_DESCRIBE_MAX_SECONDS` (default 45) is spent and returns `remaining`; the
  frontend loops until that is zero, showing progress. A run of 1,500 requests
  takes many minutes, and holding one HTTP request open that long would die at
  the proxy. The guard is wall-clock rather than a request count because rate
  limiting means the same count takes wildly different times at 13 rpm and at
  40. Because state lives in the nullable column rather than in memory, an
  interrupted pass simply leaves rows null for the next attempt.
- **Rate limiting belongs to the credentials, not to this feature.**
  `LlmService.reserveSlot()` spaces request *starts* 60s/rpm apart using the
  `rpmLimit` on the `REPORT_EXPLANATION` scope (default 13, under a Gemini free
  tier's 15/min; 0 disables it). It is one shared budget: `LlmService` is a
  single provider instance, so "Explain requests" and "Explain failures" queue
  behind each other rather than each inventing its own pacing and jointly
  blowing the limit. Pacing from the start, not sleeping after each reply, is
  what makes it a real ceiling — a slow response spends its own interval.
- **Batch size is set by the provider's *daily* cap, not its rate limit.** The
  default `LLM_DESCRIBE_BATCH_SIZE=4` keeps a 1,500-request run to 375 calls,
  inside a Gemini free tier's 500/day. It stays an env var precisely because it
  answers a different question than the four settings-page fields do.

If a whole batch comes back empty the pass stops instead of continuing: an empty
result means the provider is failing, and the remaining quota should not be spent
on calls that will fail identically. `description` is only ever written, never
cleared, so a failed call costs nothing already earned.

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
