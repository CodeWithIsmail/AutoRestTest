# engine-service

A small **Flask microservice that wraps [`autoresttest-core`](../autoresttest-core)**
behind an async-job HTTP API. The NestJS backend submits a run, gets a `jobId`
back immediately, and polls for status/results while the engine works in a
background thread.

The engine is treated as a **black box** — this service never edits core code. It
runs one job at a time (the engine reads a single global `configurations.toml`),
writing a per-run spec + config, invoking `poetry run autoresttest --skip-wizard`,
then parsing the engine's `data/<spec>/` outputs.

## Setup

```bash
cd engine-service
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then edit
python wsgi.py              # serves on http://localhost:5000
```

For local development set `ENGINE_MODE=mock` in `.env` — the service returns
canned engine outputs so the full lifecycle works offline with no LLM key or
multi-minute wait. Set `ENGINE_MODE=real` (and a funded `API_KEY`) to run the
actual engine.

## HTTP API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/health` | Liveness (exempt from auth) |
| `POST` | `/runs` | Submit a run → `202` `{jobId, status:"pending"}` |
| `GET` | `/runs/:jobId` | Job status |
| `GET` | `/runs/:jobId/result` | Normalized results (`409` until completed) |
| `DELETE` | `/runs/:jobId` | Remove a job + its working dir |

If `SERVICE_TOKEN` is set, every route except `/health` requires the
`X-Service-Token` header.

### `POST /runs` body

```json
{
  "spec": "<raw OAS 3.0 YAML/JSON string>",
  "targetUrl": "http://localhost:8080",
  "timeBudget": 300,
  "mutationRate": 0.2,
  "llmEngine": "google/gemini-2.5-flash-lite",
  "authHeader": "Bearer <token>"
}
```

`spec`, `targetUrl`, `timeBudget` are required. `targetUrl` is injected into the
spec's `servers`, so https targets and base paths are supported.

### Result shape (`GET /runs/:jobId/result`)

```json
{
  "summary": {
    "totalOperations": 12,
    "successfullyProcessed": 9,
    "coveragePct": 75.0,
    "totalRequests": 1430,
    "statusCodeDistribution": {"200": 900, "404": 300, "500": 12},
    "uniqueServerErrors": 12,
    "operationsWithServerErrors": 3
  },
  "operationStatusCodes": {},
  "serverErrors": [],
  "rawReport": {}
}
```

## Tests

```bash
python -m pytest -q      # runs entirely in mock mode; no LLM key needed
```

## Known limitations

- **One run at a time** (serialized) — the engine uses a single global config file.
- Job registry is in-memory (+ `status.json`/`result.json` per job dir); restarting
  the service loses in-flight jobs.
- Real runs need a funded OpenRouter key and take minutes.
