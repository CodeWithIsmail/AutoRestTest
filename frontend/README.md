# AutoRestTest — Frontend

The platform's web client: **Next.js 16 (App Router) + React 19 + Tailwind CSS 4
+ TanStack Query**. Every project workspace, test run, report and dependency
graph is rendered here; all data comes from the NestJS backend over REST.

- **User-facing guide:** [`../docs/USER_GUIDE.md`](../docs/USER_GUIDE.md).
- **The API this client consumes:** [`../docs/API.md`](../docs/API.md).
- **Running the whole platform:** [`../RUNNING.md`](../RUNNING.md).

> ### ⚠️ This is not the Next.js you know
>
> This is a **non-standard Next.js version with breaking changes** — APIs,
> conventions and file structure may all differ from what you remember or from
> what a search result tells you. **Read the relevant guide in
> `node_modules/next/dist/docs/` before writing code here**, and heed
> deprecation notices. See [`AGENTS.md`](AGENTS.md).

## Quick start

```bash
npm install
cp .env.example .env.local     # NEXT_PUBLIC_API_BASE_URL -> your backend
npm run dev                    # http://localhost:3001
```

The dev server runs on **port 3001** because the backend takes 3000.

| Command | Does |
|---------|------|
| `npm run dev` | Dev server on `:3001` |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the NestJS backend, no trailing slash (default `http://localhost:3000`) |

## Layout

### `app/` — routes

Two route groups split the authenticated shell from the auth pages:

```
app/
  page.tsx                          landing page
  (auth)/                           login · register · verify-signup
                                    forgot-password · reset-password
  (app)/                            everything behind a session
    projects/                       project list
    projects/[id]/                  overview
                  spec/             upload or generate the OpenAPI document
                  endpoints/        extracted + manual operations
                  graph/            dependency graph
                  team/             members and invitations
                  test-suites/                        run list
                  test-suites/[suiteId]/              run report
                  test-suites/[suiteId]/requests/[endpointId]/   captured requests
    invitations/                    invitations addressed to me
    settings/                       profile · password · notifications · delete
    admin/llm-settings/             platform-admin only
```

### `lib/` — the typed API client layer

One module per backend feature (`projects.ts`, `specs.ts`, `test-suites.ts`,
`graph.ts`, `reports.ts`, `collaboration.ts`, `llm-settings.ts`, …), each
wrapping the fetch calls for that feature and returning types from `types.ts`.
Components import from here rather than calling `fetch` directly.

Supporting modules: `api.ts` (fetch wrapper, auth header, error shape),
`session.ts` / `auth.ts` (token storage and the current user),
`query-client.ts` / `query-keys.ts` / `queries.ts` (TanStack Query setup, with
persisted cache), `curl.ts` (builds the "Copy as curl" command),
`spec-parse.ts` (client-side OpenAPI parsing for previews).

### `components/`

- **`ui/`** — the primitives everything else is built from: `Button`, `Card`,
  `Input`, `Select`, `Modal`, `ConfirmDialog`, `DropdownMenu`, `Badge`,
  `Avatar`, `Spinner`, `SegmentedControl`, `icons`.
- **Feature folders** — `projects/`, `settings/`, `graph/`, `landing/`.
- **Top-level providers** — `auth-provider.tsx`, `query-provider.tsx`,
  `toast.tsx`, plus `project-switcher.tsx` and `theme-toggle.tsx`.

## The dependency graph components

`components/graph/` is deliberately small: **`FocusView.tsx`** and the
`DependencyGraphView` wrapper, importing nothing but `Card` and the shared
types. The drawing is hand-rolled inline SVG — three fixed columns, positions
computed arithmetically. There is no layout library, no pan and no zoom.

**Do not reintroduce a whole-graph drawing.** A layered canvas, a circular
layout, an adjacency matrix, edge filters, a similarity slider and a side
inspector were all built here and all deleted. The resolved graph is
hub-and-spoke — 49 of 69 dependencies on the 76-operation sample spec leave a
single node — so every whole-graph rendering was faithful, unreadable and
useless. One operation's neighbourhood (median 1–3 neighbours) is the thing that
is legible, and it renders identically whether the API has 10 operations or 500.

## Polling

Long-running backend work is polled, not streamed: test runs and graph builds
every 3s, spec generation every 5s. That cadence is why backend rate limiting is
per-controller rather than global — a global throttle would reject the client's
own status polling.
