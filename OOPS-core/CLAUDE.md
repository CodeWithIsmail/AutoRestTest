# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OOPS (OpenAI-compatible OpenAPI generator from Project Source): given a REST API project's source code, an LLM-driven pipeline infers and generates an OpenAPI Specification (OAS) for it, plus a separate module to evaluate generated OAS against ground truth.

## Environment & commands

- Python >= 3.12, dependencies managed with `uv` (Tsinghua PyPI mirror configured as the default index in `pyproject.toml`).
- Sync env: `uv sync`
- Run the app: `uv run main.py`
- Lint: `uv run pylint --rcfile=settings.ini core` and `uv run pylint --rcfile=settings.ini expr` (pylint config, yapf style, and autoflake settings all live in `settings.ini`, not the pylint default location)
- No test suite exists in this repo currently.
- LLM access requires `LLM_API_URL` and `LLM_API_KEY` (see `.env.example`), loaded via `dotenv.load_dotenv()` in `main.py`.
- `core/shared/oas_builder.py` shells out to `java -jar core/shared/codegen-3.0.68.jar` (swagger-codegen) to upgrade a built Swagger 2.0 payload to OAS 3.x — a JRE must be on PATH for `upgrade_apidoc()` to work.
- `core/constants.py` hardcodes an `LLM_HTTP_PROXY` (`192.168.126.1:...`) — this is the original author's local dev proxy; adjust/remove for other environments rather than assuming it's load-bearing.

## Architecture

### Generation pipeline (`core/`)

`core/pipeline.py: MainPipeline` is a state machine over named steps, dispatched via `getattr(self, state_name)` and advanced through a `nexts: dict[str, str]` transition table (see `MainPipeline.run`):

```
pre_technology_analyze -> run_api_entry_detection -> add_dependency_graph_node
  -> run_file_dependency_analyze -> add_dependency_graph_edge
  -> run_endpoint_method_extract -> add_openapi_operation
  -> run_swagger_generation -> add_swagger_component -> (done)
```

Each `run_*` step calls a corresponding agent under `core/agents/<name>/` and stores results keyed by `DependencyGraph.Entry`/`Outlet`; each `add_*` step folds those results into the `DependencyGraph` or `OASBuilder`. State can be checkpointed/resumed via `MainPipeline.dump_states()` / `load_states()` (pickles the whole pipeline object — `log/pub-*/​_checkpoints/<step>/states.pickle` in existing run logs), and `confirm_each=True` on `run()` pauses for manual confirmation between steps for debugging.

Each agent module under `core/agents/<agent_name>/` follows the same shape:
- `agent.py` defines pydantic result schemas (LLM structured output), a nested `Bean` class with `wakeup()`/`verify()` static methods to convert/validate raw LLM output into the pipeline's internal representation, and an `Agent` class exposing static `run()` / `batch_run_full()` / `batch_run_lite()` methods (the latter two fan out over a `FileHandler`-scoped file list with an `asyncio.Semaphore` bound by `LLM_BATCH_SEMAPHORE`).
- `prompt.jinja` holds all prompt text for that agent, rendered with different `role=` values (e.g. `sys-prep`/`usr-prep` for a pre-filtering pass, `sys-loop`/`usr-loop` for the main iterative extraction loop) rather than being split into separate template files.

`core/ablate.py` (`AblationOfExtraction`, `AblationOfGeneration`) provides ablation-study variants that bypass parts of the main pipeline; `AblationOfGeneration` deliberately reaches into `MainPipeline`'s name-mangled private attributes via `getattr(context, '_MainPipeline__plang')` etc. to reuse an already-run pipeline's state — expect this pattern when tracing cross-module state reuse.

### Shared infrastructure (`core/shared/`)

- `DependencyGraph`: wraps a `networkx.DiGraph` of source files/handlers (`Entry`) and resolved HTTP operations (`Outlet`); used to compute transitive file dependencies (`get_dependencies`, topologically sorted) and to visualize the API graph (`visualize_full`/`visualize_lite` → PNGs).
- `FileHandler`: an `agno` `Toolkit` that walks a project directory once at construction, caches all readable text file contents (filtered by `FILE_IGNORE_PATTERNS`/size bounds in `core/constants.py`), and optionally exposes `concat_file`/`search_text`/`search_path`/`run_command` as LLM-callable tools.
- `LLMFactory`: builds an `agno` `OpenAIChat` model per call site, writing every raw HTTP request/response pair to `<log_base>/<stage>/log-<ts>-<status>-<uuid>.json` via an httpx response event hook — this is the source of the `log/pub-*/*/log-*.json` files.
- `OASBuilder`: accumulates operations into a Swagger 2.0 dict (`emplace_apidoc`, with heuristics to locate/merge `parameters`/`responses` sub-objects, dedupe request params by content hash, and merge body params into a single schema), then calls out to swagger-codegen to upgrade to OAS 3.1 (`upgrade_apidoc`) and finally hoists repeated schemas into `#/components/schemas` (`rebuild_apidoc`).

`core/libraries.py` is a centralized wildcard-import hub (typing, pydantic, networkx, agno, openapi_pydantic, stdlib, etc.) — nearly every module does `from core.libraries import *` and `from core.constants import *` instead of importing directly, and pylint's import-related warnings are disabled in `settings.ini` to accommodate this.

### Evaluation (`expr/`)

Independent of `core/`; compares a generated OAS against ground truth.
- `expr/utils.py`: pydantic beans (`OperationBean`, `ReqBean`, `ResBean`, `ConstraintBean`) that flatten `openapi_pydantic` v3.0/v3.1 objects into comparable records, plus media-type selection/schema-type-inference helpers.
- `expr/parse.py`: `load_specification()` loads an OAS string (trying both 3.0.x and 3.1.x models) into a flat `list[OperationBean]`, normalizing path params to positional `paramN` placeholders so truth/check URLs with differently-named path params still compare equal.
- `expr/judge.py`: equality predicates (`operation_equals`, `req_equals`, ...) and `compare_items`/`diff_*` functions that match truth vs. check records and bucket them into truth∩check / truth-only / check-only sets.
- `expr/calc.py`: `CompareSpecification(truth_json, check_json).compare()` orchestrates the above into a `CompareResultBean` with precision/recall/F-beta (`CompareResultMetric`) for `operation`, `req`, `res`, and `constraint` — plus `tp_log`/`fp_log`/`fn_log` for detailed inspection.

### Data directories

- `sut/`: archived source of real-world REST API projects (`pub-*.tar.gz`) with ground-truth OAS (`pub-*.gt.json`) — inputs to the pipeline and evaluation.
- `run/`: per-method/per-model output — generated OAS (`*.op.json`), and `summary.json`/`average.json` evaluation metrics.
- `log/`: per-project run artifacts — one subdirectory per pipeline stage full of raw LLM call logs, `_checkpoints/<step>/` pickled pipeline state, and `api-graph-full.png`/`api-graph-lite.png` dependency graph visualizations.

## Code style notes

This codebase is yapf-formatted (`based_on_style=facebook`, 150-col limit, `coalesce_brackets`) with unusually generous blank-line spacing between statements — match this spacing in new code rather than compacting it. Double-underscore (name-mangled) attributes are used throughout for "private" class state, including cases where other modules deliberately read them back via `getattr(obj, '_ClassName__attr')`.
