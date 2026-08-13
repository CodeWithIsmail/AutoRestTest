OAS_UPGRADE_CODEGEN: str = 'codegen-3.0.68.jar'

LLM_HTTP_MAX_RETRIES: int = 2

LLM_CORR_MAX_RETRIES: int = 1  # lowered from 3: this is the self-refine loop, and it re-runs the entire
                               # agent conversation each time. measured on swagger-generation, 56 operations
                               # cost 4028 calls and never terminated in one sitting; the refine pass was the
                               # multiplier. one pass keeps the unreferenced-json repair (which already blanks
                               # bad subtrees) and trades schema polish for a run that actually finishes

LLM_TOOL_CALL_MAX_ITERATE: int = 3  # lowered from 6: every iterate is another round trip, and this stage
                                    # dominated wall time. costs some depth, which is an accepted trade here

LLM_TOOL_CALL_MAX_TIMEOUT: int = 10

LLM_AGENT_MAX_SECONDS: int = 150  # wall-clock bound on a single agent conversation. agno 2.3.14 accepts
                                  # tool_call_limit but does not enforce it: one endpoint was observed at 482
                                  # messages and ~240 tool calls still climbing, which is how this pipeline
                                  # lost whole runs to a single file it could not stop reading. the clock is
                                  # the only bound that holds regardless of what the framework honours

LLM_HTTP_MAX_TIMEOUT: int = 3 * 60  # default for the short stages, where a call still open this long is
                                    # wedged rather than slow. swagger-generation is the exception — it emits
                                    # 6k+ completion tokens and times out here, so it overrides this per-stage
                                    # via LLMFactory(timeout=...) in the runner rather than raising the default

LLM_HTTP_HTTP1: bool = bool(1)

LLM_HTTP_HTTP2: bool = bool(0)

LLM_HTTP_VERIFY: bool | None = False

LLM_HTTP_PROXY: str | None = None

LLM_BATCH_SEMAPHORE: int = 3  # the light stages tolerate 8, but swagger-generation does not: at 8 its heavy
                              # 6k-token calls drew 25 429s and lost 14 of 39 operations. this is sized for the
                              # worst stage, since losing operations costs more than the extra wall time

LLM_RATE_LIMIT_RPM: int = 120  # matched to the semaphore above; 8b sustained well past this in probes

FILE_MIN_SIZE: int = 0 * 1024 * 1024  # exclusive

FILE_MAX_SIZE: int = 2 * 1024 * 1024  # exclusive

FILE_IGNORE_PATTERNS: list[str] = [

    '\\.sass$',
    '\\.scss$',
    '\\.less$',

    '\\.md$',
    '\\.sh$',

    '\\.bat$',
    '\\.css$',
    '\\.sql$',
    '\\.svg$',
    '\\.txt$',

    '^dockerfile$',
    '^docker-compose\\.yaml$',
    '^procfile$',
    '^makefile$',
    '^vagrantfile$',
    '^license$',

    '/dockerfile$',
    '/docker-compose\\.yaml$',
    '/procfile$',
    '/makefile$',
    '/vagrantfile$',
    '/license$',

    '^yarn\\.lock$',
    '^package-lock\\.json$',
    '^gemfile\\.lock$',
    '^pipfile\\.lock$',
    '^composer\\.lock$',
    '^go\\.sum$',

    '/yarn\\.lock$',
    '/package-lock\\.json$',
    '/gemfile\\.lock$',
    '/pipfile\\.lock$',
    '/composer\\.lock$',
    '/go\\.sum$',

    '^\\.__pycache__/',
    '^\\.__generated__/',
    '^\\.__snapshots__/',
    '^\\.vscode/',
    '^\\.github/',
    '^\\.gitlab/',
    '^\\.git/',

    '/\\.__pycache__/',
    '/\\.__generated__/',
    '/\\.__snapshots__/',
    '/\\.vscode/',
    '/\\.github/',
    '/\\.gitlab/',
    '/\\.git/',

    '\\.gitignore$',
    '\\.gitattributes$',
    '\\.prettierrc$',
    '\\.prettierignore$',
    '\\.eslintignore$',
    '\\.dockerignore$',
    '\\.editorconfig$',
    '\\.browserslistrc$',
    '\\.gitkeep$',
    '\\.htaccess$',
    '\\.keep$'
]
