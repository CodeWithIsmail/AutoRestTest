# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

OOPS (OpenAI-compatible OpenAPI generator from Project Source) uses LLM agents to reverse-engineer an OpenAPI Specification (OAS) from a REST API's source code.

- **core/**: LLM-agent pipeline that generates an OAS from a source project.
- **log/**: Runtime logs per run (raw LLM call records, intermediate per-stage state, dependency graph images, final `oas.json`/`oas.yaml`).

## Environment setup

Uses `uv` for Python environment management (Python >= 3.12).

```sh
uv sync
```

LLM API access is configured via environment variables (see `.env.example`), loaded into a `.env` file:

```sh
LLM_API_URL=YOUR-LLM-API-URL
LLM_API_KEY=YOUR-LLM-API-KEY
```

## Common commands

Lint (pylint config lives in `settings.ini`, not the default `.pylintrc`):

```sh
uv run pylint --rcfile=settings.ini core
```

Run — `main.py`'s `run_sample()` drives `MainPipeline` end-to-end against a hardcoded project path and writes `oas.json`/`oas.yaml`:

```sh
uv run main.py
```

## Architecture

### Generation pipeline (`core/`)

`core.pipeline.MainPipeline` is a state machine (`self.__state` string, advanced via a `nexts` dict in `run()`) that drives OAS generation for one source project through fixed stages, each backed by an LLM agent under `core/agents/<stage>/`:

1. `pre_technology_analyze` — `TechnologyAnalyzeAgent` detects the project's programming language and framework.
2. `run_api_entry_detection` — `APIEntryDetectionAgent` scans every source file (via `FileHandler`) for candidate API entry points.
3. `add_dependency_graph_node` — discovered entries populate `DependencyGraph` (nodes keyed by `(file, feat, handler)`).
4. `run_file_dependency_analyze` / `add_dependency_graph_edge` — `FileDependencyAnalyzeAgent` resolves cross-file references (entries tagged `'ref'`) into graph edges.
5. `run_endpoint_method_extract` / `add_openapi_operation` — `EndpointMethodExtractAgent` resolves local handlers (tagged `'local'`) into concrete HTTP methods/paths, feeding `DependencyGraph.add_operation`.
6. `run_swagger_generation` / `add_swagger_component` — `SwaggerGenerationAgent` generates request/response schemas per operation, merged into `OASBuilder`.
7. Finally `OASBuilder.upgrade_apidoc()` / `rebuild_apidoc()` produce the final `OpenAPI` pydantic object (openapi_pydantic). `upgrade_apidoc()` shells out to a bundled `java -jar core/shared/codegen-3.0.68.jar` to upgrade Swagger 2.0 → OpenAPI 3.x — a working `java` on PATH is required.

Each agent module follows the same shape: a Jinja2 `prompt.jinja` template with named blocks (`sys-prep`/`usr-prep`/`sys-loop`/`usr-loop` style roles), pydantic result schemas, a `Bean` DTO with `wakeup`/`verify` staticmethods to convert/filter raw LLM output, and `run` / `batch_run_lite` / `batch_run_full` staticmethods. `batch_run_lite` fans out one LLM call per input under a shared `asyncio.Semaphore(LLM_BATCH_SEMAPHORE)`; `plang`/`frame` values are broadcast (str) or per-task (list). Every agent function threads an `extra: dict[str, Any] | None` kwarg down to the final `Agent(..., **(extra or {}))` call — `MainPipeline.Config.llm_extra_kwargs` uses this to inject agno `Agent` params like `retries`/`delay_between_retries`/`exponential_backoff` for reactive 429 backoff.

`LLMFactory.build(store)` constructs an agno `OpenAIChat` model wired to log every raw request/response JSON into `store` (used as the per-stage log directory under `log_base`), and — if `LLMFactory(..., rpm_limit=N)` was set — paces every outgoing HTTP request through `core/shared/rate_limiter.py`'s `LLMRateLimiter` (a process-wide, model-name-keyed sliding-window limiter) via an httpx `'request'` event hook. `provider='Fireworks'` is deliberately spoofed on the constructed `OpenAIChat` as a workaround for an agno bug: agno auto-registers every `Toolkit` method with `requires_confirmation`/`external_execution` fields (defaulting to `False`, not `None`, so they always serialize), but only strips them for a small provider whitelist before sending — strict OpenAI-compatible backends (e.g. Google's Gemini endpoint) reject the unknown fields with a 400 otherwise. Workers and parsers are separate `LLMFactory` instances (`*_worker_client` vs `*_parser_client`), each overridable per-stage in `MainPipeline.Config`, falling back to `default_llm_worker_client` / `default_llm_parser_client`.

`FileHandler` (an agno `Toolkit`) walks a project directory once at construction, caches all text file contents in memory (skipping binaries, oversized files, and paths matching `FILE_IGNORE_PATTERNS` in `core/constants.py`), and optionally exposes `concat_file`/`search_text`/`search_path`/`run_command` as LLM tool calls. `run_command`'s subprocess call merges `LANG` into a *copy* of the current environment (`{**os.environ, 'LANG': ...}`) rather than replacing it — passing `env=` to `subprocess.run` replaces the whole environment otherwise, silently dropping `PATH` and breaking any non-System32 tool (this bit the `java` invocation in `oas_builder.py` too, fixed the same way).

`DependencyGraph` (wraps `networkx.DiGraph`) tracks both the file-level reference graph (`add_entry`/`add_relation`/`get_dependencies`) and the discovered API operations (`add_operation`/`get_operations`/`get_operation_implements`, keyed by `Outlet(method, apiurl, feat)`). An `Entry.tag` of `'local'` means the handler is implemented in the same file; `'ref'` means it needs cross-file resolution first. `MainPipeline.run()` renders `api-graph-full.png`/`api-graph-lite.png` (matplotlib) after every stage transition.

`MainPipeline.dump_states(target)` snapshots each stage's output as JSON plus a full pickle (`states.pickle`) for later `MainPipeline.load_states`. Pickle loading is explicitly only safe for trusted files (see comments in `pipeline.py`).

### Shared conventions

- `core/libraries.py` centralizes third-party imports (stdlib, pydantic, agno, openapi_pydantic, etc.) via wildcard export; agent/core modules do `from core.libraries import *` and `from core.constants import *` instead of importing individually.
- Tunables (retry counts, timeouts, batch concurrency, HTTP proxy, file size/ignore filters) live in `core/constants.py`.
- Classes use double-underscore-prefixed private attributes with explicit type annotations declared above `__init__`, and expose `get_*` accessor methods rather than public attributes.
- pylint is configured (`settings.ini`) with docstring/import-order/wildcard-import checks disabled — this style is intentional throughout `core/`, not an oversight.
- `core/shared/file_dependency_analyze` note: any code comparing model-produced file paths against `FileHandler.get_files()`'s keys must normalize to forward slashes (`.as_posix()` style) — `os.path.normpath()` alone uses the OS-native separator and silently breaks whitelist matching on Windows (see the fix in `core/agents/file_dependency_analyze/agent.py`).
