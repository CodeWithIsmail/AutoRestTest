# OpenAI-compatible OpenAPI generator from Project Source (OOPS)

> OOPS: Automated generation of REST API specification via LLMs

## 📁 Project Structure

-   **core/**: Python code for OAS generation.
-   **log/**: Runtime logs, including raw LLM API call records and intermediate OAS generation results, written per run.

## 🛠️ Environment Setup

⚙️ This project uses `uv` for Python environment management. You can synchronize the environment with the following command (Linux recommended):

```sh
uv sync # Make sure you have uv installed
```

⚙️ To run OAS generation, you need to configure the LLM API. Refer to `.env.example` for the format, then create a `.env` file or set environment variables with the following keys:

```sh
LLM_API_URL=YOUR-LLM-API-URL
LLM_API_KEY=YOUR-LLM-API-KEY
```

🔍 Run pylint to check code in the `core/` directory:

```sh
uv run pylint --rcfile=settings.ini core
```

▶️ Run Python files using the virtual environment:

```sh
uv run main.py
```

## 🚀 Running OAS Generation

Example code below shows how to asynchronously execute the `MainPipeline.run()` method, which returns a Pydantic-based OpenAPI object:

```py
oas: OpenAPI = await MainPipeline(
    title='Example',
    version='1.0',
    project='/path/to/your/project',
    log_base='/log/example',
    upg_base='/log/example',
    config=MainPipeline.Config(
        default_llm_worker_client=LLMFactory('gpt-5-mini'),
        default_llm_parser_client=LLMFactory('gpt-5-nano'),
        ignore_sufx=None, ignore_path=None
    )
).run()

# --------------------------------

# Export as JSON string with 2-space indentation
oas_as_string: str = oas.model_dump_json(
    exclude_unset=True,
    by_alias=True,
    indent=2
)

# Export as JSON string with 4-space indentation
oas_as_string: str = oas.model_dump_json(
    exclude_unset=True,
    by_alias=True,
    indent=4
)

# Export as dictionary
oas_as_dict: dict[str, Any] = oas.model_dump(
    exclude_unset=True,
    by_alias=True
)
```

## 👁️ Visualizing OAS

We recommend using [Swagger Editor](https://editor.swagger.io/) to inspect and visualize the generated OAS files.
