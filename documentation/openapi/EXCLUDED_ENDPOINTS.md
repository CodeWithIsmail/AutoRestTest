# Which backend endpoints to exclude from an automated run

Testing the AutoRestTest backend **with AutoRestTest** works, but 23 of its 58
operations must be kept out of the run. Not because they are untestable — because
an automated generator firing at them will send real email, spend real LLM quota,
launch engine runs against arbitrary hosts, or **revoke the very session the test
engine is authenticated with**, which ends the run for every other endpoint too.

## Files in this folder

| File | Use it for |
|------|------------|
| `autoresttest-backend.yaml` / `.json` | The **complete** API — all 58 operations. Reference, client generation, Postman import. |
| `autoresttest-backend-safe.yaml` / `.json` | The **35 safe operations**. This is the one to upload to AutoRestTest. |
| `EXCLUDED_ENDPOINTS.md` | This file — what was removed and why. |

Both specs are generated from one source, validate as OpenAPI 3.0.3, and parse
cleanly with `prance`, the engine's own parser.

---

## Before you start

**Use a dedicated throwaway account and project.** Several operations left in the
safe subset are still destructive *within their own project* — deleting
endpoints, deleting runs, removing members, changing roles. That is deliberate,
since they are worth testing, but pointed at real data they will damage it.

**Set `EMAIL_MODE=mock`** in the backend environment even so. It is the default,
and it turns the email-sending routes into console logs — but the exclusions
below assume nothing about it.

**Give the run a real `Authorization` header.** The engine cannot sign in for
itself once `POST /auth/login` is excluded, so create the throwaway account by
hand, copy its `accessToken`, and add it under **Advanced: Custom headers** on
the run:

```
Authorization: Bearer <accessToken>
```

Everything in the safe subset except `GET /auth/me` needs it.

---

## The 23 exclusions

### 1. Revokes the engine's session, or destroys what it is testing

These do not just fail — they poison every request that comes after.

| Method | Path | Why |
|--------|------|-----|
| `POST` | `/users/me/password` | Advances `passwordChangedAt`, which is the app's **only** session revocation. The bearer token in your custom header dies the instant this succeeds, and every subsequent request in the run returns 401. |
| `DELETE` | `/users/me` | Deletes the account the engine is authenticated as, **and every project it owns** — including the one under test. |
| `POST` | `/auth/reset-password` | Same revocation as a password change, for every session on the account. |
| `DELETE` | `/projects/{id}` | Deletes the project under test and cascades to its spec, endpoints, graph, runs and captured requests. Password-confirmed, so it will usually 401 — but it is not worth the one time it does not. |
| `DELETE` | `/projects/{projectId}/members/me` | The caller leaves the project. Every later request against that project then 404s. |
| `DELETE` | `/projects/{projectId}/spec` | Removes the spec and cascades to the extracted endpoints, emptying the project mid-run. |

### 2. Sends email

Real messages to whatever address the generator invents — and the mutation agent
generates plausible-looking email strings.

| Method | Path | Why |
|--------|------|-----|
| `POST` | `/auth/register` | Emails a six-digit code, and writes a `PendingSignup` row per attempt. |
| `POST` | `/auth/signup/resend` | Emails a code. Rate limited 3 per 15 min. |
| `POST` | `/auth/forgot-password` | Emails a reset link. Rate limited 3 per 15 min. |
| `POST` | `/projects/{projectId}/invitations` | Emails an invitation to a stranger, and creates a real pending invite on your project. |
| `POST` | `.../invitations/{invitationId}/resend` | Emails again. A mail failure here surfaces as 503, so it also pollutes the fault count. |

### 3. Spends LLM quota

Each call costs provider credits, and the free tiers these run on have daily caps.

| Method | Path | Why |
|--------|------|-----|
| `POST` | `/projects/{projectId}/spec/generate` | Starts the OOPS pipeline — **hours** of LLM work per call, and it queues. |
| `POST` | `.../test-suites/{suiteId}/describe` | One LLM call per batch of captured requests, until its wall-clock budget is spent. |
| `POST` | `.../test-suites/{suiteId}/explain` | One LLM call per failure. Cached afterwards, but the first pass is not free. |

### 4. Sends live traffic to third-party hosts, or starts an engine job

The dangerous category. `targetUrl` is attacker-controlled from the generator's
point of view, so these turn your test run into an outbound request generator
aimed at whatever host the fuzzer invents.

| Method | Path | Why |
|--------|------|-----|
| `POST` | `.../test-suites/{suiteId}/run` | Launches a real engine run for up to its time budget against the suite's `targetUrl`. |
| `POST` | `.../test-suites/{suiteId}/replay` | Re-sends a whole captured sequence at the target. No LLM, but the traffic is real. |
| `POST` | `.../test-suites/{suiteId}/request-logs/{logId}/run` | One real outbound request, synchronously. |
| `POST` | `/projects/{projectId}/graph` | Not dangerous, but each build is roughly a minute of gensim work in engine-service, and the calls queue up behind each other. |

### 5. Platform-wide configuration, and provider keys in cleartext

| Method | Path | Why |
|--------|------|-----|
| `PATCH` | `/admin/llm-settings/{scope}` | Rewrites the live LLM configuration for the whole deployment, no redeploy needed. A generated `apiBase` would silently repoint every AI feature. |
| `GET` | `/admin/llm-settings` | Returns each scope's **`apiKey` in plaintext**. It is harmless to call, but the response is written into `RequestLog.responseBody` — putting your provider keys in the database and on screen in the captured-requests view. |

Both are gated by the `ADMIN_EMAILS` allowlist, so a non-admin test account only
ever gets 403 from them. Exclude anyway, so the run is safe even if you later
test with an admin account.

### 6. Rate limited hard enough to drown the run

Not unsafe — just useless. The generator will exhaust the window in seconds, and
every subsequent call returns 429, which reads as a wall of failures that say
nothing about the endpoint.

| Method | Path | Limit |
|--------|------|-------|
| `POST` | `/auth/login` | 10 per 5 min |
| `POST` | `/auth/verify-signup` | 10 per 15 min |

> The other throttled routes — register, resend, forgot-password,
> reset-password, delete-account, change-password, delete-project — are already
> excluded above for stronger reasons.

### 7. Multipart upload

| Method | Path | Why |
|--------|------|-----|
| `POST` | `/projects/{projectId}/spec` | `multipart/form-data` with a binary file part. The engine generates JSON bodies, so it cannot construct a valid upload; every call is a 400 that tells you nothing. Test this one by hand. |

`POST /projects/{projectId}/spec/generate` is multipart too, and is already
excluded under §3.

---

## What is left: the 35 safe operations

This is the content of `autoresttest-backend-safe.yaml`.

### Authentication · Account
| Method | Path | |
|--------|------|--|
| `GET` | `/auth/me` | Get the current user |
| `PATCH` | `/users/me` | Update my profile |
| `PATCH` | `/users/me/notifications` | Update notification preferences |

### Projects
| Method | Path | |
|--------|------|--|
| `POST` | `/projects` | Create a project |
| `GET` | `/projects` | List my projects |
| `GET` | `/projects/{id}` | Get one project |
| `PATCH` | `/projects/{id}` | Update a project |

### Specification
| Method | Path | |
|--------|------|--|
| `GET` | `/projects/{projectId}/spec` | Get the stored spec |
| `GET` | `/projects/{projectId}/spec/generate` | Poll the generation job |
| `DELETE` | `/projects/{projectId}/spec/generate` | Discard the generated spec |
| `POST` | `/projects/{projectId}/spec/generate/apply` | Apply the generated spec |

### Endpoints · Dependency graph
| Method | Path | |
|--------|------|--|
| `GET` | `/projects/{projectId}/endpoints` | List endpoints |
| `POST` | `/projects/{projectId}/endpoints` | Add an endpoint manually |
| `DELETE` | `/projects/{projectId}/endpoints/{endpointId}` | Delete an endpoint |
| `GET` | `/projects/{projectId}/graph` | Get the dependency graph |

### Test runs
| Method | Path | |
|--------|------|--|
| `POST` | `/projects/{projectId}/test-suites` | Configure a run |
| `GET` | `/projects/{projectId}/test-suites` | List runs |
| `GET` | `.../test-suites/{suiteId}` | Get one run |
| `DELETE` | `.../test-suites/{suiteId}` | Delete a run |
| `GET` | `.../test-suites/{suiteId}/history` | A run and its replays |
| `GET` | `.../test-suites/{suiteId}/test-cases` | Per-endpoint results |
| `GET` | `.../test-suites/{suiteId}/graph` | The run's graph snapshot |

### Captured requests · Reports
| Method | Path | |
|--------|------|--|
| `GET` | `.../request-logs/summary` | Per-endpoint rollup |
| `GET` | `.../request-logs` | List captured requests |
| `GET` | `.../request-logs/{logId}` | One request in full |
| `GET` | `.../report` | Computed report |
| `GET` | `.../report/export` | CSV or PDF export |

### Collaboration
| Method | Path | |
|--------|------|--|
| `GET` | `/projects/{projectId}/invitations` | List invitations |
| `DELETE` | `.../invitations/{invitationId}` | Revoke an invitation |
| `GET` | `/projects/{projectId}/members` | List the team |
| `PATCH` | `/projects/{projectId}/members/{userId}` | Change a member's role |
| `DELETE` | `/projects/{projectId}/members/{userId}` | Remove a member |
| `GET` | `/invitations` | My pending invitations |
| `POST` | `/invitations/{token}/accept` | Accept an invitation |
| `POST` | `/invitations/{token}/decline` | Decline an invitation |

---

## Two ways to apply the exclusions

**Upload the safe spec** (simplest) — give AutoRestTest
`autoresttest-backend-safe.yaml`. The excluded operations are not in the
document, so nothing can reach them.

**Or upload the full spec and exclude per run** — AutoRestTest supports this
natively. Upload `autoresttest-backend.yaml`, open the **Endpoints** tab to see
all 58, then on **+ New run** untick the 23 listed above. The ids go into the run
as `excludedEndpointIds` and are stripped from the spec before the engine ever
sees it. This is the better option if you want the full document on the project
for reference while still running safely.

---

## Reading the results

A few things about this particular API will otherwise look like bugs:

- **401 everywhere** means the bearer token in your custom header expired
  (seven-day lifetime) or was revoked. It is not 58 separate failures.
- **A wall of 404s** is expected and correct. Project authorization answers
  **404** when the caller is not on the project at all — so every generated
  random UUID is a 404 by design, not a missing route.
- **400s are the healthy majority.** The global validation pipe runs with
  `forbidNonWhitelisted`, so any unknown field is a 400. That is the API
  behaving correctly under mutation, not failing.
- **Only 5xx counts as a fault.** AutoRestTest's own reporting already applies
  this rule: a 4xx means the API correctly rejected a bad request. Read the
  server-error count, not the pass/fail ratio.
- **Watch for a 500 on a malformed UUID.** `ParseUUIDPipe` should turn those into
  400s; a 500 there is a real finding.
