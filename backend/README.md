# AutoRestTest — Backend

The platform's application server: **NestJS 11 + Prisma 7 + PostgreSQL**. It owns
authentication, projects, API specifications, endpoints, test runs, reports and
collaboration, and drives the Python `engine-service` for anything that needs the
testing engine or the spec-generation pipeline.

- **API reference:** [`../docs/API.md`](../docs/API.md) — all 58 routes, request/response shapes, roles and error codes.
- **Running the whole platform:** [`../RUNNING.md`](../RUNNING.md).
- **Architecture and conventions across the monorepo:** [`../CLAUDE.md`](../CLAUDE.md).

## Quick start

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
npx prisma migrate dev        # create the schema
npm run start:dev             # http://localhost:3000
```

Point `ENGINE_SERVICE_URL` at a running `engine-service` and set `ENGINE_MODE=mock`
in *its* env to exercise the full run and spec-generation flows offline in
seconds — no LLM key and no real engine run required.

## Commands

| Command | Does |
|---------|------|
| `npm run start:dev` | Watch-mode dev server |
| `npm run build` | `nest build` → `dist/` |
| `npm run start:prod` | `node dist/src/main` |
| `npm test` | Jest unit tests (`*.spec.ts` under `src/`) |
| `npm test -- projects` | Run one test file or pattern |
| `npm run test:e2e` | Jest with `test/jest-e2e.json` |
| `npm run test:cov` | Coverage |
| `npm run lint` | `eslint --fix` |
| `npm run format` | `prettier --write` |

Prisma:

```bash
npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma generate                    # regenerate the client
npx prisma studio                      # DB browser
```

## Layout

Each feature is a folder under `src/` holding `*.module.ts`, `*.controller.ts`,
`*.service.ts` and a `dto/` directory. Controllers stay thin and delegate to
services.

| Module | Owns |
|--------|------|
| `auth/` | Register, login, email verification, password reset, JWT strategy, guards |
| `users/` | What a signed-in user does to their own account: profile, password, notifications, deletion |
| `projects/` | Project CRUD; ownership |
| `specs/` | OpenAPI upload/validation, and spec generation from a source zip |
| `endpoints/` | Operations extracted from the spec, plus manually added ones |
| `graph/` | The dependency graph: build orchestration and `graph-merge.ts` |
| `test-suites/` | Run configuration, execution, replay, captured requests, request descriptions |
| `reports/` | Computed run reports, CSV/PDF export, LLM failure explanations |
| `collaboration/` | Members, invitations, and the invitee's own invitation list |
| `llm-settings/` | Admin-only live LLM configuration |
| `engine/` | HTTP client for `engine-service` |
| `email/` | Transactional mail via Resend |
| `common/` | `ProjectAccessService` — the single authorization chokepoint |
| `prisma/` | Global `PrismaService` |

## Conventions worth matching

These are the ones that will bite you if you deviate.

- **Import Prisma from `generated/prisma/client`, not `@prisma/client`.** The
  client is generated to `backend/generated/prisma/`, outside `node_modules`.
  `PrismaService` builds a `PrismaPg` driver adapter from `DATABASE_URL` at
  construction — the legacy implicit `datasource.url` flow is gone. Re-run
  `npx prisma generate` after editing `prisma/schema.prisma`.
- **A single global `ValidationPipe`** runs with `whitelist`,
  `forbidNonWhitelisted` and `transform` on. Every payload is validated against
  its DTO and **unknown fields are rejected with a 400** — which is also what
  keeps immutable fields (like `username`) immutable for free.
- **All project authorization goes through
  `ProjectAccessService.assertAccess(projectId, userId, mutatingRoles?)`.** It
  returns **404** when the project is missing or the caller is not on it at all,
  and **403** when they are a member whose role is too low. Omit `mutatingRoles`
  for a read; pass `[Role.admin]` for owner+admin, `[Role.admin, Role.tester]`
  to also admit testers. Do not hand-roll a permission check.
- **Always use `select` projections** — never return the password hash. Define
  an explicit return-shape interface next to the service (`PublicUser`,
  `ProjectListItem`, `ProjectDetail`). The shared `PublicUser` and
  `PUBLIC_USER_SELECT` live in `users/user.types.ts` rather than in a service,
  because `JwtStrategy` needs them and must not import the service it guards.
- **Use Nest's HTTP exceptions for control flow** — `NotFoundException`,
  `ForbiddenException`, `ConflictException`, `BadRequestException`,
  `UnauthorizedException`. Catch `Prisma.PrismaClientKnownRequestError` and
  branch on `err.code` (`P2002` unique violation, `P2025` not found) to
  translate DB errors into the right status.
- **Validate `:id` path params with `new ParseUUIDPipe()`**, and wrap
  multi-row writes that must be atomic in `prisma.$transaction`.
- **Rate limiting is per-controller, never global.** `ThrottlerModule.forRoot`
  is registered with **no `APP_GUARD`**; `ThrottlerGuard` is applied on
  `AuthController`, `UsersController` and the project-delete route only. A
  global limit would also throttle the run-status and graph endpoints the
  frontend polls every three seconds.

Two auth details that are easy to break:

- **`login` takes `identifier`, not `email`** — one field accepting an email
  address *or* a username, told apart by the `@` that usernames forbid.
- **`passwordChangedAt` is the app's only session revocation.** `JwtStrategy`
  rejects any token whose `iat` predates it. Compare **whole seconds** on both
  sides: `iat` has one-second resolution, and comparing it against a
  millisecond timestamp rejects the token minted by "reset, then sign in".

## Environment

See `.env.example` for the full list with comments. The ones without a default:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Token signing key (7-day expiry) |
| `ENGINE_SERVICE_URL` | Base URL of the Python `engine-service` |

`PrismaService` and `JwtStrategy` both throw a clear error at startup if their
variable is missing. The Prisma CLI reads `DATABASE_URL` through
`prisma.config.ts`.

Other groups: `PORT` / `CORS_ORIGIN` / `APP_URL` (serving),
`ENGINE_SERVICE_TOKEN`, `ADMIN_EMAILS` (the platform-admin allowlist — there is
no DB-backed admin role), `REQUIRE_EMAIL_VERIFICATION`, the `LLM_*` group
(defaults for the report/description features; an admin can override most of
them live from the settings page), and the `EMAIL_*` group. **`EMAIL_MODE=mock`
is the default** and logs mail to the console instead of sending it.
