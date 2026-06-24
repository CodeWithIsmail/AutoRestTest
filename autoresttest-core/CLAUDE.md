# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

AutoRestTest is a Python tool for automated REST API testing. It parses an OpenAPI 3.0 spec, builds a semantic dependency graph between operations, uses LLM-backed agents to generate realistic test data, and drives request generation with multi-agent reinforcement learning (MARL/Q-learning) within a time budget. It supports any OpenAI-API-compatible LLM provider (OpenAI, OpenRouter, Azure, local models via LM Studio/Ollama/vLLM/etc.) — the model must support JSON mode.

## Commands

```bash
# Install (Poetry is the supported path; pip/conda alternatives exist but are not recommended)
poetry install

# Run (interactive TUI + config wizard)
poetry run autoresttest

# Run without the wizard, using configurations.toml directly
poetry run autoresttest --skip-wizard

# Quick wizard (essential settings only), or override spec/duration via CLI
poetry run autoresttest --quick
poetry run autoresttest -s path/to/spec.yaml -t 600

# Type checking (dev dependency group; no separate lint/format tool is configured)
poetry run pyright
poetry run mypy src

# Docker
docker build -t autoresttest .
docker run -it autoresttest
```

There is no test suite in this repository (no `tests/` directory, no `test_*.py` files) — don't assume one exists when planning changes.

A `.env` file at the project root must define `API_KEY` for the LLM provider. `configurations.toml` at the project root is the single source of runtime configuration (spec location, LLM engine/provider, Q-learning hyperparameters, caching, custom headers, etc.) — it's loaded and validated into a frozen pydantic `Config` model via `autoresttest.config.get_config()` (`src/autoresttest/config/config.py`), cached with `lru_cache`.

## Architecture

The pipeline, driven from `src/autoresttest/autoresttest.py:main()`, runs in four phases per spec:

1. **Spec parsing** (`specification/specification_parser.py`) — resolves the OpenAPI 3.0 file with `prance` (with a configurable recursion limit for circular `$ref`s and a strict/lenient validation toggle) into `OperationProperties` dataclasses (`models/models.py`).
2. **Graph construction** (`graph/generate_graph.py`) — builds an `OperationGraph` of `OperationNode`/`OperationEdge`. Edges encode *semantic* dependencies between operations (e.g. a response field of one operation matching a parameter of another), computed via cosine similarity over word embeddings in `graph/similarity_comparator.py` using `utils.EmbeddingModel` (gensim). The graph (and later the Q-tables) can be cached to disk with Python `shelve` under `cache/graphs/` and `cache/q_tables/` (`utils/utils.py`), keyed by spec name, controlled by `[cache]` in `configurations.toml`. Caches are versioned by structure — clear `cache/` after changing graph/table generation logic.
3. **Q-table initialization** — before any RL happens, every agent's Q-table is populated. The Value Agent (and optional Header Agent) make LLM calls per operation to generate realistic parameter/body values (`llm/value_generator.py`, `llm/llm.py`); this phase is *not* time-bounded and can run in parallel via a thread pool (`[agent.value]` config).
4. **MARL request generation** (`marl/marl.py:QLearning`) — the actual fuzzing/testing loop, bounded by `[request_generation].time_duration`. Seven cooperating Q-learning agents (all implementing the `BaseAgent` ABC in `agents/base_agent.py`) each own one decision: `OperationAgent` (which operation to call), `ParameterAgent` (which parameter combination), `ValueAgent` (LLM-sourced values), `BodyObjAgent` (which body properties), `DataSourceAgent` (LLM vs. DEFAULT vs. DEPENDENCY-sourced values), `DependencyAgent` (cross-operation value reuse, mined from prior successful responses/params/bodies), and `HeaderAgent` (Basic-auth header fuzzing, opt-in, disabled by default). `QLearning.execute_operations()` combines their Q-values via value decomposition into one TD-error update per step, applies a separate randomized fuzzing/mutation path (`mutate_values`, boundary values, type mutation, method/media/location mutation) at `[request_generation].mutation_rate`, dispatches the HTTP call (`utils.dispatch_request`), and records successes/errors/dependencies for use by later steps.

Results are written to `data/<spec_name>/` (`report.json`, `q_tables.json`, `server_errors.json`, `operation_status_codes.json`, `successful_{parameters,bodies,responses,primitives}.json`); these can grow to gigabytes on long runs and are safe to delete between runs.

The TUI layer (`tui/`, built on Rich) wraps the whole pipeline: `ConfigWizard` for interactive setup, `TUIDisplay` for phase/step output, `LiveDisplay` for the live request-generation dashboard, `InitializationProgressDisplay` for Q-table generation progress. `AutoRestTest` in `autoresttest.py` is the orchestration class that calls into each phase and drives the TUI.

### Key data structures

- `ParameterKey` (`models/models.py`) is the canonical identity for an OpenAPI parameter: a `(name, in_value)` tuple, since the same name can appear in `query`, `header`, `path`, or `cookie`. Built/parsed via `utils.make_param_key` / `param_key_to_label`.
- `OperationProperties`, `ParameterProperties`, `SchemaProperties`, `ResponseProperties` (`models/models.py`) are dataclasses mirroring the relevant subset of the OpenAPI schema, with a `to_dict()`/`to_dict_helper()` convention for JSON-serializing nested dataclasses while dropping `None`/empty values (used for cache and report output).
- Config models in `config/config.py` mirror the TOML sections 1:1 (`SpecConfig`, `LLMConfig`, `AgentCombinationConfig`, `CacheConfig`, `QLearningConfig`, `RequestGenerationConfig`, `ApiConfig`, `CustomHeadersConfig`); `CustomHeadersConfig` allows arbitrary extra keys and interpolates `${VAR_NAME}` from the environment for header values (e.g. bearer tokens from `.env`).

### Behavioral notes worth knowing before changing agent/MARL code

- The Header Agent only supports Basic Authentication and takes priority over `[custom_headers].Authorization` when both are enabled — don't enable both if you need bearer/API-key auth.
- Parameter combination explosion is bounded by depth-weighted stratified sampling (`[agent].max_combinations`, `max_total_combinations`, `base_samples_per_size`, `combination_seed`) rather than enumerating all combinations.
- `[api].override_url` / `host` / `port` bypass the `servers` URL from the OpenAPI spec for local/staging targets.
