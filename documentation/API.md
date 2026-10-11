# AutoRestTest — Backend API Reference

REST API for the AutoRestTest platform (NestJS + Prisma + PostgreSQL).

- **Base URL:** `http://localhost:3000`
- **Auth scheme:** JWT Bearer — send `Authorization: Bearer <access_token>` on every protected route.
- **Content type:** `application/json` for all routes **except** spec upload (multipart `form-data`).
- **Validation:** a global pipe rejects unknown/extra fields with `400 Bad Request`.

> Run the server with `npm run start:dev` from the `backend/` folder.

> **Machine-readable version:** [`openapi/autoresttest-backend.yaml`](openapi/autoresttest-backend.yaml)
> (and `.json`) describe the same 58 routes as OpenAPI 3.0.3 — import them into
> Postman, generate a client, or feed them to AutoRestTest itself. If you are
> testing this API with AutoRestTest, read
> [`openapi/EXCLUDED_ENDPOINTS.md`](openapi/EXCLUDED_ENDPOINTS.md) first.

---

## Modules at a glance

| # | Module | Base path | Status |
|---|--------|-----------|:------:|
| 1 | Authentication | `/auth` | ✅ |
| 1b | Profile / Account | `/users/me` | ✅ |
| 2 | Projects | `/projects` | ✅ |
| 3 | API Specification | `/projects/:projectId/spec` | ✅ |
| 4 | Endpoints | `/projects/:projectId/endpoints` | ✅ |
| 5 | Test Suites + Execution | `/projects/:projectId/test-suites` | ✅ |
| 6 | Results / Reports | `/projects/:projectId/test-suites/:suiteId/report` | ✅ |
| 7 | Team Collaboration | `/projects/:projectId/{invitations,members}` · `/invitations` | ✅ |
| 8 | Dependency Graph | `/projects/:projectId/graph` | ✅ |
| 9 | Admin / LLM Settings | `/admin/llm-settings` | ✅ |

---

## All endpoints

| # | Method | Endpoint | Auth | Who can access | Description |
|---|--------|----------|:----:|----------------|-------------|
| 1 | `POST` | `/auth/register` | 🔓 Public | Anyone | Start signup + email a code (creates no account yet) |
| 2 | `POST` | `/auth/login` | 🔓 Public | Anyone | Log in with an **email or username**, returns a JWT |
| 3 | `GET` | `/auth/me` | 🔒 | Logged-in user | Get the current user's profile |
| 3a | `POST` | `/auth/verify-signup` | 🔓 Public | Anyone with the code | Finish signup: creates the account, returns a JWT |
| 3b | `POST` | `/auth/signup/resend` | 🔓 Public | Anyone | Reissue the signup code |
| 3c | `POST` | `/auth/forgot-password` | 🔓 Public | Anyone | Email a one-time reset link |
| 3d | `POST` | `/auth/reset-password` | 🔓 Public | Anyone with the token | Set a new password, ends all sessions |
| 3e | `PATCH` | `/users/me` | 🔒 | Logged-in user | Update display name / avatar colour |
| 3f | `PATCH` | `/users/me/notifications` | 🔒 | Logged-in user | Toggle the recurring emails |
| 3g | `POST` | `/users/me/password` | 🔒 | Logged-in user | Change password, ends all sessions |
| 3h | `DELETE` | `/users/me` | 🔒 | Logged-in user | Delete the account and everything it owns |
| 4 | `POST` | `/projects` | 🔒 | Logged-in user | Create a project (caller becomes owner) |
| 5 | `GET` | `/projects` | 🔒 | Logged-in user | List projects the user owns or is a member of |
| 6 | `GET` | `/projects/:id` | 🔒 | Owner / member | Get one project with owner + members |
| 7 | `PATCH` | `/projects/:id` | 🔒 | Owner | Update name and/or description |
| 8 | `DELETE` | `/projects/:id` | 🔒 | Owner | Delete a project (cascades members) |
| 9 | `POST` | `/projects/:projectId/spec` | 🔒 | Owner / admin | Upload or replace the OpenAPI spec (auto-extracts endpoints) |
| 10 | `GET` | `/projects/:projectId/spec` | 🔒 | Any member | Get the stored spec (metadata + content) |
| 11 | `DELETE` | `/projects/:projectId/spec` | 🔒 | Owner / admin | Delete the stored spec |
| 11a | `POST` | `/projects/:projectId/spec/generate` | 🔒 | Owner / admin | Generate a spec from a zip of the API's source code (async) |
| 11b | `GET` | `/projects/:projectId/spec/generate` | 🔒 | Any member | Poll the generation job and read the result |
| 11c | `POST` | `/projects/:projectId/spec/generate/apply` | 🔒 | Owner / admin | Apply the generated spec to the project |
| 11d | `DELETE` | `/projects/:projectId/spec/generate` | 🔒 | Owner / admin | Discard the generated spec without applying it |
| 12 | `GET` | `/projects/:projectId/endpoints` | 🔒 | Any member | List the project's endpoints |
| 13 | `POST` | `/projects/:projectId/endpoints` | 🔒 | Owner / admin | Manually add an endpoint |
| 14 | `DELETE` | `/projects/:projectId/endpoints/:endpointId` | 🔒 | Owner / admin | Delete an endpoint |
| 15 | `POST` | `/projects/:projectId/test-suites` | 🔒 | Owner / admin / tester | Configure a test run |
| 16 | `GET` | `/projects/:projectId/test-suites` | 🔒 | Any member | List test runs (newest first) |
| 17 | `GET` | `/projects/:projectId/test-suites/:suiteId` | 🔒 | Any member | Get one test run (config + results) |
| 18 | `DELETE` | `/projects/:projectId/test-suites/:suiteId` | 🔒 | Owner / admin | Delete a test run |
| 19 | `POST` | `/projects/:projectId/test-suites/:suiteId/run` | 🔒 | Owner / admin / tester | Execute a run via the engine (async) |
| 19a | `POST` | `/projects/:projectId/test-suites/:suiteId/replay` | 🔒 | Owner / admin / tester | Re-send a run's captured requests verbatim as a new linked run |
| 19b | `GET` | `/projects/:projectId/test-suites/:suiteId/history` | 🔒 | Any member | The origin run plus every replay of it |
| 20 | `GET` | `/projects/:projectId/test-suites/:suiteId/test-cases` | 🔒 | Any member | Per-endpoint results of a run |
| 20a | `GET` | `/projects/:projectId/test-suites/:suiteId/request-logs/summary` | 🔒 | Any member | Per-endpoint rollup of captured requests |
| 20b | `GET` | `/projects/:projectId/test-suites/:suiteId/request-logs` | 🔒 | Any member | Captured requests, filterable by endpoint + status |
| 20c | `GET` | `/projects/:projectId/test-suites/:suiteId/request-logs/:logId` | 🔒 | Any member | One captured request/response in full |
| 20d | `POST` | `/projects/:projectId/test-suites/:suiteId/request-logs/:logId/run` | 🔒 | Owner / admin / tester | Re-send one captured request live, return the fresh response |
| 20e | `POST` | `/projects/:projectId/test-suites/:suiteId/describe` | 🔒 | Owner / admin / tester | Write plain-language descriptions onto captured requests |
| 20f | `GET` | `/projects/:projectId/test-suites/:suiteId/graph` | 🔒 | Any member | The dependency graph snapshotted for this run |
| 21 | `GET` | `/projects/:projectId/test-suites/:suiteId/report` | 🔒 | Any member | Computed results report (JSON) |
| 22 | `GET` | `/projects/:projectId/test-suites/:suiteId/report/export?format=csv\|pdf` | 🔒 | Any member | Download report as CSV or PDF |
| 23 | `POST` | `/projects/:projectId/test-suites/:suiteId/explain` | 🔒 | Owner / admin / tester | Generate LLM failure explanations |
| 24 | `POST` | `/projects/:projectId/invitations` | 🔒 | Owner / admin | Invite a user by email |
| 25 | `GET` | `/projects/:projectId/invitations` | 🔒 | Owner / admin | List a project's invitations |
| 26 | `DELETE` | `/projects/:projectId/invitations/:invitationId` | 🔒 | Owner / admin | Revoke a pending invitation |
| 26a | `POST` | `/projects/:projectId/invitations/:invitationId/resend` | 🔒 | Owner / admin | Re-send the invitation email |
| 27 | `GET` | `/projects/:projectId/members` | 🔒 | Any member | List owner + members |
| 28 | `PATCH` | `/projects/:projectId/members/:userId` | 🔒 | Owner / admin | Change a member's role |
| 29 | `DELETE` | `/projects/:projectId/members/:userId` | 🔒 | Owner / admin | Remove a member |
| 30 | `DELETE` | `/projects/:projectId/members/me` | 🔒 | Any member | Leave the project |
| 31 | `GET` | `/invitations` | 🔒 | Logged-in user | My pending invitations |
| 32 | `POST` | `/invitations/:token/accept` | 🔒 | Invited user | Accept an invitation |
| 33 | `POST` | `/invitations/:token/decline` | 🔒 | Invited user | Decline an invitation |
| 34 | `GET` | `/projects/:projectId/graph` | 🔒 | Any member | The project's spec-derived dependency graph + build state |
| 35 | `POST` | `/projects/:projectId/graph` | 🔒 | Owner / admin / tester | Build the graph from the project's current spec (async) |
| 36 | `GET` | `/admin/llm-settings` | 🔒 | Platform admin | Every LLM scope and its live overrides |
| 37 | `PATCH` | `/admin/llm-settings/:scope` | 🔒 | Platform admin | Set or clear one scope's overrides |

---

## Module 1 — Authentication

### 1. Register — `POST /auth/register`  🔓

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `username` | string | ✅ | 3–32 chars; letters, numbers, underscore only |
| `email` | string | ✅ | Valid email address |
| `password` | string | ✅ | Minimum 8 characters |

```json
{
  "username": "ismail",
  "email": "ismail@example.com",
  "password": "secret123"
}
```

**Response `201 Created`** — `{ message, verificationRequired }`.

**No account is created here and no token is returned.** The details are parked
in `pending_signups` and a six-digit code is emailed; the account comes into
existence at `POST /auth/verify-signup`. Writing to `users` up front meant that
registering with an address you did not own claimed it forever, since
`User.email` is unique and nobody would ever verify it.

Registering the **same email twice overwrites** the pending signup rather than
returning 409 — a pending row reserves nothing, so whoever can actually read
the inbox ends up with the account. `409` is returned only once a *real*
account holds the email or username.

When `verificationRequired` is `false` the server has verification switched off
and the account was created outright; send the user to sign in.

Rate limited to **5 per hour** per IP.

---

### 2. Login — `POST /auth/login`  🔓

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `identifier` | string | ✅ | The account's **email address or username** |
| `password` | string | ✅ | — |

```json
{
  "identifier": "ismail",
  "password": "secret123"
}
```

**Response `200 OK`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "…",
    "username": "ismail",
    "email": "ismail@example.com",
    "name": null,
    "avatarColor": null,
    "emailVerified": true,
    "notifyRunFinished": true,
    "notifyInvitations": true,
    "createdAt": "2026-08-16T…"
  }
}
```

Save `accessToken` and send it as `Authorization: Bearer <accessToken>` on protected routes.
A wrong password and an unknown account return the same `401 Invalid credentials.`
Rate limited to **10 per 5 minutes** per IP.

---

### 3. Get my profile — `GET /auth/me`  🔒

**Headers:** `Authorization: Bearer <access_token>`

**Response `200 OK`** — the authenticated user's profile, in the shape shown above.

---

### 3a–3b. Finish signing up  🔓

`POST /auth/verify-signup` with `{ "email": "…", "code": "418302" }` → `200`
with `{ accessToken, user }`. **This is where the account is created**, so the
response is a full session, identical in shape to login.

Public by necessity: there is no account yet, so the address in the body is
what identifies the pending signup. That is safe here in a way a public login
gate would not be — a pending signup is disposable, so a failed delivery means
"register again", never a locked account.

Errors: `401` no pending signup or wrong code (the message reports attempts
remaining), `410` expired, `409` if the username or email was taken by someone
else while the code sat unread. **Five wrong codes destroy the pending signup**
— the attempt counter, not the 24-hour expiry, is what makes six digits safe.

`POST /auth/signup/resend` with `{ "email": "…" }` → always `200 { message }`,
pending signup or not. Issues a new code, retires the old one, and resets the
attempt counter. **3 per 15 minutes.**

Because no unverified account can exist, nothing else in the API needs a
verification check. Set `REQUIRE_EMAIL_VERIFICATION=false` to skip the pending
step altogether.

---

### 3c–3d. Password reset  🔓

`POST /auth/forgot-password` with `{ "email": "…" }` → **always** `200` with the
same message, registered or not. A registered address is emailed a one-time link
to `APP_URL/reset-password?token=…`, valid for 30 minutes. **3 per 15 minutes.**

`POST /auth/reset-password` with `{ "token": "…", "password": "…" }` → `200`.
The token is single-use: `401` unknown, `409` already used, `410` expired.
Succeeding **invalidates every existing JWT for that account** — including the
attacker's, which is the point.

---

## Module 1b — Profile / Account

> All routes require `Authorization: Bearer <access_token>`.

### 3e. Update profile — `PATCH /users/me`

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | Optional, ≤60 chars. `""` clears it back to the username. |
| `avatarColor` | string | Optional, one of `emerald` `blue` `purple` `amber` `rose` `cyan` `zinc` |

`username` and `email` are **not** accepted — the username is a login
identifier and is immutable; sending either returns `400`.

**Response `200 OK`** — the updated user.

### 3f. Notification preferences — `PATCH /users/me/notifications`

`{ "notifyRunFinished": bool?, "notifyInvitations": bool? }` → `200` with the
updated user. Covers only the recurring mail; verification codes, reset links
and the password-changed notice are always sent.

### 3g. Change password — `POST /users/me/password`

`{ "currentPassword": "…", "newPassword": "…" }` → `200 { message }`.
`401` if the current password is wrong, `400` if the new one is unchanged.
Ends every session, this one included, so the client must sign in again.
**5 per 15 minutes.**

### 3h. Delete account — `DELETE /users/me`

`{ "password": "…" }` → `200 { message }`. Irreversible. Removes the user, their
memberships, the invitations they sent, and **every project they own** with all
its specs, endpoints, runs and logs. Runs they triggered inside other people's
projects survive with a null `triggeredById`. **5 per 15 minutes.**

---

## Module 2 — Projects

> All routes require `Authorization: Bearer <access_token>`.
> `:id` must be a valid **UUID**.

### 4. Create project — `POST /projects`

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `name` | string | ✅ | 1–100 characters |
| `description` | string | ❌ | Up to 500 characters |

```json
{
  "name": "Petstore API",
  "description": "Testing the petstore service"
}
```

**Response `201 Created`** — project detail including `id`, `owner`, and `members`.

---

### 5. List projects — `GET /projects`

**Response `200 OK`** — array of projects the user owns or is a member of, each with `memberCount` and the caller's `role`.

---

### 6. Get one project — `GET /projects/:id`

**Response `200 OK`** — full project detail (owner + members).
**Errors:** `404` not found · `403` not a member.

---

### 7. Update project — `PATCH /projects/:id`

At least one field must be provided.

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `name` | string | ❌* | 1–100 characters |
| `description` | string \| null | ❌* | Up to 500 chars; `null` clears it |

\* At least one of the two is required.

```json
{
  "name": "Petstore API v2",
  "description": "Updated description"
}
```

**Response `200 OK`** — updated project detail. **Errors:** `400` no fields · `403` not owner · `404` not found.

---

### 8. Delete project — `DELETE /projects/:id`

Owner only, and **the owner's password must be sent in the body to confirm** —
a valid session is not enough for something this irreversible, so an unattended
laptop cannot destroy a project.

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `password` | string | ✅ | The owner's current password |

```json
{ "password": "secret123" }
```

**Response `200 OK`** — `{ "message": "Project deleted successfully" }`.

**Errors:** `400` password missing (`Enter your password to confirm`) ·
`401` password is incorrect · `403` not the owner · `404` not found ·
`429` more than 5 attempts in 15 minutes.

Deleting a project cascades to its members, spec, endpoints, dependency graph,
test runs and their captured requests.

---

## Module 3 — API Specification

> All routes require `Authorization: Bearer <access_token>`.
> `:projectId` must be a valid **UUID**. One spec per project — uploading replaces the existing one.

### 9. Upload / replace spec — `POST /projects/:projectId/spec`

**Body:** `multipart/form-data`

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `file` | File | ✅ | `.yaml`, `.yml`, or `.json`; OpenAPI **3.x**; max 5 MB |

**Postman:** Body → `form-data` → key `file`, type **File** → select your spec file. Do **not** set `Content-Type` manually.

**Validation:** must parse as YAML/JSON, must declare `openapi: 3.x` (Swagger 2.0 is rejected), must pass OpenAPI schema validation.

**Response `201 Created`**

```json
{
  "id": "…",
  "fileName": "petstore.yaml",
  "generatedByAI": false,
  "uploadedAt": "2026-06-26T12:00:00.000Z",
  "openapiVersion": "3.0.0",
  "title": "Swagger Petstore",
  "endpointCount": 14
}
```

**Errors:** `400` invalid/empty/wrong-type/too-large/Swagger-2.0 · `403` not owner/admin · `404` project not found.

---

### 10. Get spec — `GET /projects/:projectId/spec`

**Response `200 OK`** — metadata plus the raw `fileContent`.
**Errors:** `403` not a member · `404` no spec uploaded.

---

### 11. Delete spec — `DELETE /projects/:projectId/spec`

**Response `200 OK`** — `{ "message": "API specification deleted successfully" }`.
**Errors:** `403` not owner/admin · `404` no spec uploaded.

---

## Module 3b — Spec generation from source code

Instead of uploading a spec, a project owner/admin can upload a **zip of the
API's source** and have one generated. The result is held for review and only
becomes the project's spec once it is applied (route 11c) — generation never
replaces a spec on its own. There is one generation per project; starting a new
one replaces the previous attempt.

Generation is slow (LLM-driven analysis of the whole codebase, minutes to
hours). Poll route 11b for progress.

### 11a. Start generation — `POST /projects/:projectId/spec/generate`

**Body:** `multipart/form-data`

| Field | Required | Notes |
|---|---|---|
| `file` | yes | `.zip` of the source tree, ≤ 50 MB |
| `title` | no | `info.title`; defaults to the project name |
| `version` | no | `info.version`; defaults to `1.0.0` |
| `ignorePath` | no | comma-separated directories to skip; merged with the defaults (`node_modules`, `dist`, `build`, `coverage`, `.git`, `venv`, `.venv`, `__pycache__`) |

**Response `202 Accepted`**

```json
{
  "id": "uuid",
  "status": "running",
  "sourceName": "demo-api.zip",
  "step": null,
  "stepIndex": 0,
  "stepTotal": 9,
  "generatedSpec": null,
  "operationCount": 0,
  "warnings": [],
  "error": null,
  "createdAt": "2026-08-13T01:34:34.676Z",
  "startedAt": "2026-08-13T01:34:34.643Z",
  "completedAt": null
}
```

**Errors:** `400` missing/non-zip/oversized archive, or the engine rejected it
(corrupt zip, too many files, expands too large) · `403` not owner/admin ·
`409` a generation is already running · `503` engine-service unreachable.

### 11b. Get generation — `GET /projects/:projectId/spec/generate`

**Response `200 OK`** — the same shape as 11a. While running, `step` holds a
human-readable stage name (e.g. `"Generating request/response schemas"`) and
`stepIndex`/`stepTotal` track progress through the 9-step pipeline. Once
`status` is `completed`, `generatedSpec` holds the OpenAPI 3 JSON awaiting
review and `warnings` may explain reduced fidelity (e.g. converted from
Swagger 2.0 because no JRE was available on the engine host).

**Errors:** `403` not a member · `404` no generation for this project.

### 11c. Apply generation — `POST /projects/:projectId/spec/generate/apply`

Promotes the reviewed document to the project's spec. Validated and persisted
through the same path as an upload, with `generatedByAI: true` and a
`<archive>.generated.json` filename, then the generation record is deleted.

**Response `201 Created`** — same body as route 9.
**Errors:** `403` not owner/admin · `404` no generation · `409` the generation
is not completed yet · `400` the generated document failed validation.

### 11d. Discard generation — `DELETE /projects/:projectId/spec/generate`

Drops the generation. Any existing spec is left untouched.

**Response `200 OK`** — `{ "message": "Specification generation discarded" }`.
**Errors:** `403` not owner/admin · `404` no generation.

---

## Module 4 — Endpoints

> All routes require `Authorization: Bearer <access_token>`.
> `:projectId` and `:endpointId` must be valid **UUIDs**.

**Auto-extraction:** every time a spec is uploaded (route 9) or a generated one
is applied (route 11c), the project's endpoints are re-synced from the spec's
`paths` — one entry per path × method (GET/POST/PUT/PATCH/DELETE;
`head`/`options`/`trace` are ignored). **Storing a spec replaces all endpoints
for the project**, including any that were added manually.

### 12. List endpoints — `GET /projects/:projectId/endpoints`

**Response `200 OK`** — array ordered by path then method:

```json
[
  {
    "id": "…",
    "method": "GET",
    "path": "/users/{id}",
    "description": "Get a user by id",
    "addedManually": false,
    "createdAt": "2026-06-26T12:00:00.000Z"
  }
]
```
**Errors:** `403` not a member.

### 13. Add endpoint manually — `POST /projects/:projectId/endpoints`

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `method` | string | ✅ | One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `path` | string | ✅ | Must start with `/` (e.g. `/orders`) |
| `description` | string | ❌ | Up to 500 characters |

```json
{
  "method": "POST",
  "path": "/orders",
  "description": "Create an order"
}
```

**Response `201 Created`** — the created endpoint (`addedManually: true`).
**Errors:** `400` invalid body · `403` not owner/admin · `409` an endpoint with that path+method already exists.

### 14. Delete endpoint — `DELETE /projects/:projectId/endpoints/:endpointId`

**Response `200 OK`** — `{ "message": "Endpoint deleted successfully" }`.
**Errors:** `403` not owner/admin · `404` endpoint not found in this project.

---

## Module 5 — Test Suites

> All routes require `Authorization: Bearer <access_token>`.
> `:projectId` and `:suiteId` must be valid **UUIDs**.

A **test suite is a test run record** — one row per run. This module *configures
and manages* runs; actual execution against the engine comes in a later module.
A newly created suite has `status: "pending"`, and the result counters
(`coveredEndpoints`, `passedTestCases`, …) plus `jobId`/`startedAt`/`completedAt`
stay at their defaults until a run is executed.

### 15. Create test run — `POST /projects/:projectId/test-suites`

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `name` | string | ❌ | Up to 100 characters |
| `targetUrl` | string | ✅ | Valid URL incl. `http(s)://` (e.g. `http://localhost:8080`) |
| `timeBudget` | integer | ✅ | Seconds the engine may run; `1`–`3600` |
| `mutationRate` | number | ❌ | Fault-injection rate `0`–`1` (defaults to `0.2`) |
| `customHeaders` | object | ❌ | Extra headers sent with **every** request to the target — see below |
| `excludedEndpointIds` | string[] | ❌ | Endpoint UUIDs to strip from the spec before this run; at most 500 |

```json
{
  "name": "Nightly smoke run",
  "targetUrl": "http://localhost:8080",
  "timeBudget": 300,
  "mutationRate": 0.3,
  "customHeaders": { "Authorization": "Bearer eyJhbGci..." },
  "excludedEndpointIds": ["3f1c...", "9ab2..."]
}
```

**`customHeaders`** is how you authenticate against a target that needs it
(Bearer, Basic, or an API-key header). It is a flat string-to-string map,
validated on the way in because these values flow straight into outbound
requests: **at most 20 pairs**, names must match the RFC 7230 token charset,
names at most 100 characters, values at most 4000, and **no CR/LF anywhere in a
value** (CRLF-injection guard). Anything else is rejected with
`Custom headers must be an object of at most 20 header name/value string pairs,
with valid header names and no line breaks in values`.

**`excludedEndpointIds`** removes those operations from the spec handed to the
engine, so it never generates requests for them at all — use it to keep a
destructive or expensive endpoint out of a run. The ids come from route 12.

**Response `201 Created`** — the created run (`status: "pending"`, zeroed result counters).

**Errors:** `400` invalid body **or the project has no endpoints yet** ·
`403` not owner/admin/tester · `404` project not found.

### 16. List test runs — `GET /projects/:projectId/test-suites`

**Response `200 OK`** — array of runs ordered newest first, each with its config and results summary.
**Errors:** `403` not a member.

### 17. Get one test run — `GET /projects/:projectId/test-suites/:suiteId`

**Response `200 OK`** — full run detail (config, results summary, `jobId`, `triggeredById`).
**Errors:** `403` not a member · `404` run not found in this project.

### 18. Delete test run — `DELETE /projects/:projectId/test-suites/:suiteId`

**Response `200 OK`** — `{ "message": "Test suite deleted successfully" }`. Cascades the run's test cases.
**Errors:** `403` not owner/admin · `404` run not found in this project.

### 19. Execute a run — `POST /projects/:projectId/test-suites/:suiteId/run`

Hands the run to the Python **engine-service** and returns immediately while the
engine works. NestJS polls the engine in the background and syncs the suite's
`status` + result counters; the frontend just re-fetches route 17.

**Preconditions:** the project must have a stored spec (`400` otherwise); the
suite must not already be `running` (`409`).

**Response `202 Accepted`** — the suite with `status: "running"`, a `jobId`, and
`startedAt` set. Re-running resets the counters and clears prior test cases.
**Errors:** `400` no spec uploaded · `403` not owner/admin/tester · `404` run not found · `409` already running · `503` engine-service unreachable.

Poll route 17 until `status` is `completed` or `failed`; on completion the
counters (`totalEndpoints`, `coveredEndpoints`, `totalTestCases`,
`passedTestCases`, `failedTestCases`) are populated.

### 19a. Replay a run — `POST …/test-suites/:suiteId/replay`

Re-sends the origin run's **captured request sequence verbatim** against the
target and records the outcome as a new, linked run. This is a deterministic
regression check, not a fresh AI-generated run — **engine-service is not
involved at all**, so it needs no LLM and no time budget.

The new suite copies the source's `targetUrl`, `timeBudget`, `mutationRate`,
`customHeaders` and `totalEndpoints`, and carries `runType: "replay"` plus
`originSuiteId`.

**Replaying a replay still resends the true origin's sequence.** The server
resolves `originSuiteId ?? id`, so every replay in a chain stays directly
comparable to its siblings rather than drifting a generation at a time.

Captured requests whose body was clipped at storage time
(`requestTruncated: true`) are **skipped**, not sent — an incomplete body would
corrupt the request rather than reproduce it.

**Response `202 Accepted`** — the new suite with `status: "running"`. Poll
route 17 on the *new* id. The original run's results are never overwritten.

**Errors:** `400` the origin has no captured requests to replay · `403` not
owner/admin/tester · `404` run not found · `409` the source run is still
running.

### 19b. Run history — `GET …/test-suites/:suiteId/history`

The origin run **plus every replay of it**, oldest first — pass either the
origin's id or any replay's id and you get the same chain back. Each entry is
the same summary shape as route 16, so a client can chart counters across the
chain.

**Errors:** `403` not a member · `404` run not found.

### 20. Run results — `GET /projects/:projectId/test-suites/:suiteId/test-cases`

**Response `200 OK`** — one row per tested endpoint:

```json
[
  {
    "id": "…",
    "endpointId": "…",
    "method": "GET",
    "path": "/pets",
    "statusCode": 200,
    "passed": true,
    "responseBody": { "200": 20, "404": 2 },
    "failureExplanation": null,
    "createdAt": "2026-07-01T12:00:00.000Z"
  }
]
```
`responseBody` holds the per-operation status-code distribution; `passed` is true
if the endpoint saw any 2xx. **Errors:** `403` not a member · `404` run not found.

### 20a. Captured-request summary — `GET …/test-suites/:suiteId/request-logs/summary`

Per-endpoint rollup of everything the recording proxy captured during the run.
Drives the endpoint and response-code filters in the UI.

```json
[
  {
    "endpointId": "…", "method": "GET", "path": "/pets",
    "total": 12, "passed": 8, "failed": 4,
    "statusClasses": { "2xx": 8, "4xx": 4 },
    "statusCodes": { "200": 8, "404": 4 }
  }
]
```
`statusCodes` holds exact codes; a request that never got a response counts
toward `total` and `statusClasses.other` but appears in neither map. Matched
endpoints come first (by path), with the `endpointId: null` unmatched bucket
last. **Errors:** `403` not a member · `404` run not found.

### 20b. Captured requests — `GET …/test-suites/:suiteId/request-logs`

Paginated list of the individual requests, in send order (`seq`).

| Query | Values | Meaning |
|---|---|---|
| `endpointId` | UUID · `unmatched` | Only this endpoint, or only requests that matched none |
| `status` | `2xx` `3xx` `4xx` `5xx` · an exact code such as `404` | Response status class, or one specific HTTP response code |
| `page` | ≥ 1 (default 1) | Page number |
| `pageSize` | 1–200 (default 50) | Rows per page |

An unrecognised `status` is ignored and the list comes back unfiltered.

```json
{
  "items": [
    { "id": "…", "seq": 1, "method": "GET", "path": "/pets",
      "statusCode": 200, "durationMs": 34 }
  ],
  "total": 120, "page": 1, "pageSize": 50
}
```
**Errors:** `403` not a member · `404` run not found.

### 20c. One captured request — `GET …/test-suites/:suiteId/request-logs/:logId`

Full request/response pair: URL, both header maps, both bodies, and
`requestTruncated`/`responseTruncated` flags for bodies clipped at storage time.
**Errors:** `403` not a member · `404` run or record not found.

---

### 20d. Re-send one captured request — `POST …/request-logs/:logId/run`

Live-sends a single captured request against the target **right now** and
returns the fresh response synchronously — the "run it again" button on a
request's detail view. Useful for checking whether a failure still reproduces
after a fix.

**Ephemeral: nothing is persisted.** The stored log is untouched and no new
`RequestLog` row is written; the fresh response exists only in this response
body.

Requires owner/admin/tester — the same bar as replay, because this makes a real
outbound call that can have real side effects on the target API.

**Response `200 OK`**

```json
{
  "method": "POST",
  "url": "https://api.example.com/pets",
  "statusCode": 500,
  "durationMs": 214,
  "responseHeaders": { "content-type": "application/json" },
  "responseBody": "{\"error\":\"internal\"}",
  "responseTruncated": false,
  "error": null,
  "ranAt": "2026-08-27T10:15:00.000Z"
}
```

`error` is set **instead of** a response when the fetch itself failed (network
error, DNS failure, timeout); `statusCode` is then `null`.

**Errors:** `400` the captured request body was truncated and cannot be run
faithfully · `403` not owner/admin/tester · `404` run or record not found.

### 20e. Describe captured requests — `POST …/test-suites/:suiteId/describe`

Writes a one-sentence plain-language description ("Test with an empty title
field") onto captured requests that do not have one yet — the **Explain
requests** button. Purely a readability layer: the run itself is not re-executed
and nothing about its results changes.

**The pass is bounded and resumable, not one long request.** A single call works
until its wall-clock budget (`LLM_DESCRIBE_MAX_SECONDS`, default 45s) is spent,
then returns what is left in `remaining`. **Call it again until `remaining` is
0.** Holding one HTTP request open for a 1,500-request run would die at the
proxy; because progress lives in a nullable DB column, an interrupted pass
simply leaves rows null for the next attempt.

**Response `200 OK`**

| Field | Meaning |
|-------|---------|
| `total` | Requests captured by the run |
| `described` | Requests that now carry a description, including ones already done |
| `remaining` | Still undescribed — call again to continue; `0` means finished |
| `writtenNow` | How many rows *this* invocation wrote |
| `usedLlm` | `false` when the LLM is unreachable/unconfigured and nothing was written |

Descriptions are only ever written, never cleared, so a failed call costs
nothing already earned. If a whole batch comes back empty the pass stops rather
than spending the remaining quota on calls that will fail identically.

**Errors:** `403` not owner/admin/tester · `404` run not found · `503` no LLM
credentials configured for the `REPORT_EXPLANATION` scope.

### 20f. Run's dependency graph — `GET …/test-suites/:suiteId/graph`

The dependency graph **snapshotted for this run**, with the RL agent's learned
Q-values layered onto its edges (`weightKind: "confidence"`), versus the
project-level graph's raw similarity scores. Its own endpoint rather than a
field on the suite detail because the payload is large and only one screen wants
it.

**Response `200 OK`** — `{ "graph": … }` in the shape described in
[Module 8](#module-8--dependency-graph), or `{ "graph": null }` if the run
captured none. Snapshots stored before the resolution change are re-resolved on
read, so old runs return the current shape.

**Errors:** `403` not a member · `404` run not found.

---

## Module 6 — Results / Reports

> All routes require `Authorization: Bearer <accessToken>`. `:projectId` and
> `:suiteId` must be valid **UUIDs**. Reports are available only once the run's
> `status` is `completed`.

### 21. Report — `GET …/test-suites/:suiteId/report`

**Response `200 OK`** — a computed report:

```json
{
  "overview": {
    "status": "completed", "targetUrl": "http://localhost:8080",
    "durationSeconds": 120,
    "totalEndpoints": 4, "coveredEndpoints": 3, "coveragePct": 75,
    "totalTestCases": 40, "passedTestCases": 28, "failedTestCases": 12,
    "passRatePct": 70
  },
  "statusCodeDistribution": { "200": 28, "404": 8, "500": 3 },
  "endpoints": [
    { "method": "GET", "path": "/pets", "passed": false,
      "statusCodes": { "500": 3 }, "hasServerErrors": true,
      "failureExplanation": null }
  ],
  "failures": [ /* the subset of endpoints where passed=false */ ]
}
```
**Errors:** `403` not a member · `404` run not found · `409` run not completed yet.

### 22. Export — `GET …/test-suites/:suiteId/report/export?format=csv|pdf`

Streams a downloadable file (`Content-Disposition: attachment`).
- `format=csv` → `text/csv`, one row per endpoint.
- `format=pdf` → `application/pdf`, a formatted summary + per-endpoint list + failures section.

**Errors:** `400` bad format · `403` not a member · `404`/`409` as above.

### 23. Explain failures — `POST …/test-suites/:suiteId/explain`

Runs an LLM over each failed endpoint (using its status codes + server errors)
and **caches** a plain-language explanation onto each failed test case.

**Response `200 OK`** — the failed endpoints with populated `failureExplanation`.
Requires `LLM_MODE=mock` (offline canned text) or a real `LLM_API_KEY`.
**Errors:** `403` not owner/admin/tester · `404`/`409` as above · `503` LLM not configured.

---

## Module 7 — Team Collaboration

> Project-scoped routes require `Authorization: Bearer <accessToken>`; `:projectId`,
> `:invitationId`, `:userId` must be valid **UUIDs**. The `/invitations` routes are
> for the *invitee* (they may not be a project member yet), so they're not
> project-scoped.
>
> **Inviting sends an email** carrying a link to the frontend's Invitations page
> (`APP_URL/invitations?token=…`), delivered through Resend. Delivery is
> best-effort: the invitation is created, and the response still returns the
> shareable `token` + `acceptUrl`, whether or not the mail went out. With
> `EMAIL_MODE=mock` the message is logged to the server console instead of sent.
> See `.env.example` for the `EMAIL_*` / `RESEND_API_KEY` / `APP_URL` settings.

### 24. Invite by email — `POST /projects/:projectId/invitations`  (owner/admin)

**Body:** `{ "email": "bob@example.com", "role": "tester" }` (`role` ∈ `admin|tester|viewer`).

**Response `201 Created`**

```json
{
  "id": "…", "email": "bob@example.com", "role": "tester",
  "status": "pending", "token": "8900fff2…",
  "acceptUrl": "/invitations/8900fff2…/accept",
  "expiresAt": "2026-07-08T…", "createdAt": "2026-07-01T…"
}
```
Invitations **expire seven days** after they are created (`expiresAt`); past
that, accepting returns `410 Gone` and the invite can be re-sent from route 26a.

An email goes to `email`; `token`/`acceptUrl` are also returned so the link can be shared by hand. Note `acceptUrl` is the **API** path the invitee's client POSTs to — the emailed link points at the frontend instead. **Errors:** `400` email is the owner · `403` not owner/admin · `409` already a member **or** a pending invite already exists.

### 25–26. List / revoke invitations  (owner/admin)
`GET …/invitations` → all invitations (any status) with their links.
`DELETE …/invitations/:invitationId` → `{ "message": "Invitation revoked" }` (`404` if not found).

### 26a. Re-send the invitation email — `POST …/invitations/:invitationId/resend`  (owner/admin)

Sends the invitation email again, **reusing the existing token** so any link
already in the invitee's inbox keeps working.

**Response `200 OK`** — `{ "message": "Invitation email sent" }`

**Errors:** `403` not owner/admin · `404` no such invitation in this project ·
`409` the invitation is already `accepted`/`declined`/`expired` · `410` it has
passed `expiresAt` · `503` the mail could not be sent (unlike route 24, this
endpoint exists only to send mail, so a delivery failure is reported).

### 27. List members — `GET /projects/:projectId/members`  (any member)

```json
{
  "owner": { "userId": "…", "username": "alice", "email": "a@x.com" },
  "members": [
    { "userId": "…", "username": "bob", "email": "b@x.com", "role": "tester", "joinedAt": "…" }
  ]
}
```

### 28–30. Manage members
- `PATCH …/members/:userId` `{ "role": "admin" }` (owner/admin) → updated member; `404` if not a member.
- `DELETE …/members/:userId` (owner/admin) → `{ "message": "Member removed" }`.
- `DELETE …/members/me` (any member) → leave; `400` if you're the owner.

### 31. My invitations — `GET /invitations`

**Response `200 OK`** — the caller's **pending, non-expired** invitations (matched to their account email), each with `projectName`, `role`, `token`, `invitedBy`.

### 32–33. Accept / decline — `POST /invitations/:token/accept|decline`

Accept creates the membership and marks the invite `accepted`. **The caller's account
email must equal the invited email** (`403` otherwise). **Errors:** `404` unknown token ·
`403` wrong email · `409` already accepted/declined · `410` expired.

---

## Module 8 — Dependency Graph

The engine's defining feature: the **Semantic Property Dependency Graph**, which
records that "the `id` returned by `POST /orders` is what `GET /orders/{id}`
consumes". Two flavours exist — this one is **static**, derived from the spec
alone; a completed run's graph (route 20f) is the same structure with the RL
agent's learned confidence layered on.

### 34. Get the project's graph — `GET /projects/:projectId/graph`

Any project member. Returns a `pending` placeholder rather than `404` when no
graph has been built, so the UI has one shape to render and can show its "build
this" call to action.

**Response `200 OK`**

```json
{
  "status": "ready",
  "graph": { "...": "see below" },
  "error": null,
  "completedAt": "2026-08-27T10:15:00.000Z"
}
```

`status` is one of `pending` · `running` · `ready` · `failed`. `graph` is `null`
unless `status` is `ready`; `error` carries the reason when `failed`.

**The graph payload**

| Field | Type | Meaning |
|-------|------|---------|
| `schema` | number | Payload version. Older stored graphs are upgraded on read |
| `source` | `"spec"` \| `"run"` | Spec-derived, or snapshotted from a run |
| `generatedAt` | ISO string | When it was built |
| `truncated` | boolean | Whether the graph was clipped for size |
| `nodes` | array | One per operation |
| `edges` | array | One per (producer, consumer) pair |
| `stats` | object | Rollup counters |

A **node**: `id`, `method`, `path`, `summary`, `parameters[]`,
`hasRequestBody`, plus `statusCodes`, `totalRequests` and `hasServerErrors` when
the graph came from a run.

An **edge**: `from` (the **producer**), `to` (the **consumer**), `kind`,
`maxSimilarity`, `maxQ`, `tentative`, `matches[]`, and a display `weight` with
`weightKind` (`"similarity"` for a spec graph, `"confidence"` for a run's).

> **Direction reads as execution order.** The engine stores edges the other way
> round — consumer → producer, meaning "this operation's parameters can be
> filled from that one's response". The backend flips them exactly once, so by
> the time you see them `from` produces and `to` consumes. Nothing downstream
> re-flips.

**`stats`:** `operations`, `dependencies`, `candidates`, `confirmed`,
`predicted`, `penalized`, `discovered`, `isolated`, `entryPoints[]` (operations
nothing feeds), and `mostDependedUpon` (`{ id, count }` or `null`).

> **These edges are resolved, not raw.** The engine emits a *candidate* set from
> field-name similarity, which is quadratic and near-useless — 76 operations
> produce 2,589 candidate edges. The backend resolves them the same way the
> engine's Dependency Agent does: the single highest-scoring producer per
> (consumer, parameter), grouped into one edge per pair. The same spec then
> yields 69 edges.

**Errors:** `403` not a member · `404` project not found.

### 35. Build the graph — `POST /projects/:projectId/graph`

Owner/admin/tester. Builds from the project's **current** spec and returns
immediately; the build runs in engine-service and the client polls route 34.

Construction is embedding-based rather than LLM-based — seconds of work behind a
one-off model load — and the server gives it ten minutes before timing out.

The previous graph is **cleared** when a build starts, so a stale one can never
be shown as if it were the result of the build now running.

**Response `202 Accepted`** — `{ "status": "running", "graph": null, "error": null, "completedAt": null }`.

**Errors:** `400` a graph build is already in progress · `403` not
owner/admin/tester · `404` project not found, or the project has no API
specification to build a graph from · `503` engine-service unreachable.

---

## Module 9 — Admin / LLM Settings

Live-editable LLM tuning knobs, so the model, endpoint, key and rate limit for
each of the platform's LLM surfaces can change **without a redeploy**.

> **Platform admin is not a project role.** `Role` (`admin`/`tester`/`viewer`)
> is scoped to one project and has no bearing here. These two routes are gated
> by `AdminGuard` on `PublicUser.isAdmin`, computed from the **`ADMIN_EMAILS`
> allowlist** — an env var, with no DB-backed role and no promotion flow. Any
> other authenticated user gets `403 Admin access required`.

There are three **scopes**, one per LLM surface:

| Scope | Powers |
|-------|--------|
| `TEST_ENGINE` | Value generation inside the MARL test engine |
| `SPEC_GENERATION` | The OOPS pipeline that writes a spec from source code |
| `REPORT_EXPLANATION` | Failure explanations and captured-request descriptions |

### 36. List settings — `GET /admin/llm-settings`

**Response `200 OK`** — always **all three** scopes, in a fixed order. A scope
with no override stored comes back as an all-null row rather than being absent,
so the settings form has something to bind to.

```json
[
  {
    "scope": "TEST_ENGINE",
    "model": "google/gemini-2.5-flash-lite",
    "apiBase": "https://openrouter.ai/api/v1",
    "rpmLimit": 13,
    "apiKey": "sk-...",
    "updatedAt": "2026-08-27T10:15:00.000Z"
  }
]
```

A `null` field means **"no admin override — fall back to that surface's
environment default"**. For `TEST_ENGINE` and `SPEC_GENERATION` that default
lives in engine-service's own environment (a separate, possibly
differently-hosted process), so an unset field is simply omitted from the
request to engine-service rather than guessed at here.

**Errors:** `401` not signed in · `403` not a platform admin.

### 37. Update one scope — `PATCH /admin/llm-settings/:scope`

`:scope` must be one of the three names above; anything else is
`400 Unknown scope: … Expected one of …`.

**Body (JSON)** — every field is a partial update. **Omit** a key to leave it
unchanged, send it as **`null`** to clear the override and fall back to the
environment default, or send a value to set it.

| Field | Type | Rules |
|-------|------|-------|
| `model` | string \| null | At most 200 characters |
| `apiKey` | string \| null | At most 2000 characters |
| `apiBase` | string \| null | Valid URL **including `http(s)://`**; at most 500 characters |
| `rpmLimit` | integer \| null | 0–1000; **`0` disables the limit** |

```json
{ "model": "google/gemini-2.5-flash", "rpmLimit": 30 }
```

**Response `200 OK`** — the updated row in the same shape as route 36.

**Errors:** `400` unknown scope or a field failed validation · `401` not signed
in · `403` not a platform admin.

---

## Running the platform (local)

Two services must be up:
1. **engine-service** (Python) — `cd engine-service && python wsgi.py` (default `:5000`, set `ENGINE_MODE=mock` for offline dev).
2. **backend** (NestJS) — `cd backend && npm run start:dev` (`:3000`), with `ENGINE_SERVICE_URL=http://127.0.0.1:5000` in `.env`.

---

## Roles (RBAC)

A project member holds one role. The owner implicitly has full access.

| Role | Spec & endpoints (write/delete) | Run · replay · describe · build graph | Delete test runs | Members & invitations | Read everything |
|------|:---:|:---:|:---:|:---:|:---:|
| **owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **tester** | ❌ | ✅ | ❌ | ❌ | ✅ |
| **viewer** | ❌ | ❌ | ❌ | ❌ | ✅ |

> The owner is the project creator (only one) and implicitly has full access —
> the owner is never listed as a member and cannot be removed or demoted.
> Testers can configure, execute, replay and describe runs and build the
> dependency graph, but cannot manage the spec/endpoints, delete runs, or
> manage the team.

Every project route funnels through one authorization check
(`ProjectAccessService.assertAccess`), which returns **`404` when the project
does not exist or the caller is not on it at all**, and **`403` when the caller
is a member but their role is too low** for the operation.

**Platform admin (`/admin/*`) is separate** — it comes from the `ADMIN_EMAILS`
env allowlist, not from any project role, and grants nothing inside a project.

---

## Common error responses

| Status | Meaning | Typical cause |
|--------|---------|---------------|
| `400 Bad Request` | Validation failed | Bad/missing field, unknown field, invalid spec file |
| `401 Unauthorized` | Missing/invalid token | No `Authorization` header or expired JWT |
| `403 Forbidden` | Not allowed | Authenticated but lacks the required role/ownership |
| `404 Not Found` | Resource missing | Project or spec does not exist |
| `409 Conflict` | Duplicate or bad state | Username/email already taken; a run is already executing |
| `410 Gone` | Expired | An invitation or password-reset token past its TTL |
| `429 Too Many Requests` | Rate limited | Auth/account routes throttled per IP |
| `503 Service Unavailable` | Dependency down | engine-service unreachable, or no LLM credentials configured |

---

## Suggested Postman flow

1. `POST /auth/register` → `POST /auth/login`, copy `accessToken`.
2. Set a collection variable `{{token}}` and add header `Authorization: Bearer {{token}}` at the collection level.
3. `POST /projects` → copy the returned `id` into `{{projectId}}`.
4. `POST /projects/{{projectId}}/spec` with a `form-data` file (the Swagger Petstore OpenAPI 3.0 YAML works well).
5. `GET /projects/{{projectId}}/spec` to confirm it was stored.
6. `GET /projects/{{projectId}}/endpoints` — the upload extracts these automatically.
7. `POST /projects/{{projectId}}/graph`, then poll `GET …/graph` until `status` is `ready`.
8. `POST /projects/{{projectId}}/test-suites` with a `targetUrl` and `timeBudget` → copy the returned `id` into `{{suiteId}}`.
9. `POST /projects/{{projectId}}/test-suites/{{suiteId}}/run`, then poll `GET …/test-suites/{{suiteId}}` until `status` is `completed`.
10. `GET …/test-suites/{{suiteId}}/report` for the rollup, and `GET …/request-logs` for what was actually sent.
11. `POST …/test-suites/{{suiteId}}/describe` repeatedly until `remaining` is `0`.
12. `POST …/test-suites/{{suiteId}}/replay` to re-send the same sequence and compare.

> Set `ENGINE_MODE=mock` in `engine-service/.env` to walk this whole flow
> offline in seconds — no LLM key and no real engine run required.
