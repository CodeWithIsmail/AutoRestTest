# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

AutoRestTest is an AI-powered platform for automated REST API testing. The repo is a **monorepo of three independent subprojects** that are developed and run separately (each has its own dependencies, build, and lockfile):

- **`autoresttest-core/`** — the Python testing engine. Parses an OpenAPI 3.0 spec, builds a semantic dependency graph between operations, and drives request generation with multi-agent reinforcement learning (MARL/Q-learning) plus LLM-backed value generation. This is the underlying research tool; the backend/frontend wrap it into a SaaS product.
- **`backend/`** — NestJS 11 + Prisma 7 + PostgreSQL REST API. The platform's application server (auth, projects, and future test-orchestration modules).
- **`frontend/`** — Next.js 16 + React 19 + Tailwind CSS 4 web client.

Each subproject has its own agent docs — **read them before working in that subproject**:
- `autoresttest-core/CLAUDE.md` — full architecture of the Python engine (pipeline phases, the seven Q-learning agents, caching, config).
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
