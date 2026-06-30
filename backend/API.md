# AutoRestTest — Backend API Reference

REST API for the AutoRestTest platform (NestJS + Prisma + PostgreSQL).

- **Base URL:** `http://localhost:3000`
- **Auth scheme:** JWT Bearer — send `Authorization: Bearer <access_token>` on every protected route.
- **Content type:** `application/json` for all routes **except** spec upload (multipart `form-data`).
- **Validation:** a global pipe rejects unknown/extra fields with `400 Bad Request`.

> Run the server with `npm run start:dev` from the `backend/` folder.

---

## Modules at a glance

| # | Module | Base path | Status |
|---|--------|-----------|:------:|
| 1 | Authentication | `/auth` | ✅ |
| 2 | Projects | `/projects` | ✅ |
| 3 | API Specification | `/projects/:projectId/spec` | ✅ |
| 4 | Endpoints | `/projects/:projectId/endpoints` | ✅ |

---

## All endpoints

| # | Method | Endpoint | Auth | Who can access | Description |
|---|--------|----------|:----:|----------------|-------------|
| 1 | `POST` | `/auth/register` | 🔓 Public | Anyone | Create a new user account |
| 2 | `POST` | `/auth/login` | 🔓 Public | Anyone | Log in, returns a JWT access token |
| 3 | `GET` | `/auth/me` | 🔒 | Logged-in user | Get the current user's profile |
| 4 | `POST` | `/projects` | 🔒 | Logged-in user | Create a project (caller becomes owner) |
| 5 | `GET` | `/projects` | 🔒 | Logged-in user | List projects the user owns or is a member of |
| 6 | `GET` | `/projects/:id` | 🔒 | Owner / member | Get one project with owner + members |
| 7 | `PATCH` | `/projects/:id` | 🔒 | Owner | Update name and/or description |
| 8 | `DELETE` | `/projects/:id` | 🔒 | Owner | Delete a project (cascades members) |
| 9 | `POST` | `/projects/:projectId/spec` | 🔒 | Owner / admin | Upload or replace the OpenAPI spec (auto-extracts endpoints) |
| 10 | `GET` | `/projects/:projectId/spec` | 🔒 | Any member | Get the stored spec (metadata + content) |
| 11 | `DELETE` | `/projects/:projectId/spec` | 🔒 | Owner / admin | Delete the stored spec |
| 12 | `GET` | `/projects/:projectId/endpoints` | 🔒 | Any member | List the project's endpoints |
| 13 | `POST` | `/projects/:projectId/endpoints` | 🔒 | Owner / admin | Manually add an endpoint |
| 14 | `DELETE` | `/projects/:projectId/endpoints/:endpointId` | 🔒 | Owner / admin | Delete an endpoint |

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

**Response `201 Created`** — the created user (password never returned).

---

### 2. Login — `POST /auth/login`  🔓

**Body (JSON)**

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `email` | string | ✅ | Valid email |
| `password` | string | ✅ | Minimum 8 characters |

```json
{
  "email": "ismail@example.com",
  "password": "secret123"
}
```

**Response `200 OK`** — `{ access_token, user }`. Save `access_token` for protected routes.

---

### 3. Get my profile — `GET /auth/me`  🔒

**Headers:** `Authorization: Bearer <access_token>`

**Response `200 OK`** — the authenticated user's profile.

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

**Response `200 OK`** — `{ "message": "Project deleted successfully" }`.
**Errors:** `403` not owner · `404` not found. Members are removed automatically (cascade).

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

## Module 4 — Endpoints

> All routes require `Authorization: Bearer <access_token>`.
> `:projectId` and `:endpointId` must be valid **UUIDs**.

**Auto-extraction:** every time a spec is uploaded (route 9), the project's
endpoints are re-synced from the spec's `paths` — one entry per path × method
(GET/POST/PUT/PATCH/DELETE; `head`/`options`/`trace` are ignored).
**Re-uploading a spec replaces all endpoints for the project**, including any
that were added manually.

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

## Roles (RBAC)

A project member holds one role. The owner implicitly has full access.

| Role | Manage spec & endpoints (write/delete) | Read project, spec & endpoints | Notes |
|------|:--------------------------------------:|:------------------------------:|-------|
| **owner** | ✅ | ✅ | Creator of the project; only one |
| **admin** | ✅ | ✅ | Full management within the project |
| **tester** | ❌ | ✅ | Will run tests (future modules) |
| **viewer** | ❌ | ✅ | Read-only |

---

## Common error responses

| Status | Meaning | Typical cause |
|--------|---------|---------------|
| `400 Bad Request` | Validation failed | Bad/missing field, unknown field, invalid spec file |
| `401 Unauthorized` | Missing/invalid token | No `Authorization` header or expired JWT |
| `403 Forbidden` | Not allowed | Authenticated but lacks the required role/ownership |
| `404 Not Found` | Resource missing | Project or spec does not exist |
| `409 Conflict` | Duplicate | e.g. username/email already taken on register |

---

## Suggested Postman flow

1. `POST /auth/register` → `POST /auth/login`, copy `access_token`.
2. Set a collection variable `{{token}}` and add header `Authorization: Bearer {{token}}` at the collection level.
3. `POST /projects` → copy the returned `id` into `{{projectId}}`.
4. `POST /projects/{{projectId}}/spec` with a `form-data` file (the Swagger Petstore OpenAPI 3.0 YAML works well).
5. `GET /projects/{{projectId}}/spec` to confirm it was stored.
