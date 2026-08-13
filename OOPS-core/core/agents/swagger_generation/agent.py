from core.shared import FileHandler

from core.shared import unreference_json

from core.libraries import *

from core.constants import *

with open(f'{os.path.dirname(__file__)}/prompt.jinja', 'r', encoding='utf-8') as __file:
    prompt: jinja2.Template = jinja2.Template(__file.read())


class SwaggerGenerationResult(BaseModel, frozen=True):

    def __new__(cls: type[BaseModel]):

        # llm response format can not process complex JSON schema

        # llm response format can not process complex JSON schema

        raise RuntimeError('Structured output not used here')


class SwaggerGenerationRefine(BaseModel, frozen=True):

    def __new__(cls: type[BaseModel]):

        # llm response format can not process complex JSON schema

        # llm response format can not process complex JSON schema

        raise RuntimeError('Structured output not used here')


class SwaggerGenerationAgent:

    class Bean(BaseModel, frozen=True):

        req: list[Any] | dict[str, Any]
        res: list[Any] | dict[str, Any]

        @staticmethod
        def wakeup(req: Any, res: Any) -> 'SwaggerGenerationAgent.Bean':

            if req is None or not isinstance(req, (list, dict)):
                raise RuntimeError()  # obviously invalid

            if res is None or not isinstance(res, (list, dict)):
                raise RuntimeError()  # obviously invalid

            return SwaggerGenerationAgent.Bean(req=req, res=res)

        @staticmethod
        def verify(req: Any, res: Any) -> bool:

            if req is None or not isinstance(req, (list, dict)):
                return False  # structured output not used here

            if res is None or not isinstance(res, (list, dict)):
                return False  # structured output not used here

            return True

    # ------------------------------------------------

    @staticmethod
    def cache_file(cache: str, target: str, apiurl: str, method: str) -> str:

        # one file per (target, endpoint). the key is hashed because apiurl carries '/' and '{}' and is not
        # a legal file name on its own, and because the pair has to survive verbatim across processes

        digest = hashlib.sha256(f'{method} {apiurl}'.encode('utf-8')).hexdigest()[:32]

        return f'{cache}/{target}-{digest}.json'

    @staticmethod
    async def __batch_run(
        context: FileHandler,
        worker_model: Model,
        parser_model: Model,
        plangs: list[str] | str,  # same value if is str
        frames: list[str] | str,  # same value if is str
        apiurls: list[str],  # for prompt template render
        methods: list[str],  # for prompt template render
        depends: list[list[Any]],  # for prompt template render
        extra: dict[str, Any] | None = None,
        cache: str | None = None  # directory to persist per-endpoint results into, None disables it
    ) -> list[Optional['SwaggerGenerationAgent.Bean']]:

        parameters = [i for i in inspect.signature(SwaggerGenerationAgent.__batch_run).parameters if isinstance(locals()[i], list)]

        plangs = [plangs for _ in depends] if isinstance(plangs, str) else plangs

        frames = [frames for _ in depends] if isinstance(frames, str) else frames

        assert len({len(locals()[i]) for i in parameters}) == 1  # require all same length

        # ------------------------------------------------

        async def solve_spec(semaphore: asyncio.Semaphore, target: str, *args: Any) -> Any:  # wrap semaphore

            # args: use fixed order of parameters for simplicity — (plang, frame, apiurl, method, depend)

            store = SwaggerGenerationAgent.cache_file(cache, target, args[2], args[3]) if cache else None

            # this is by far the most expensive stage and it fails as a whole, so without a cache every
            # attempt restarts from zero and a project large enough to fail once can never finish. an
            # endpoint that already produced a spec is read back instead of being paid for again

            if store and os.path.isfile(store):

                try:

                    with open(store, 'r', encoding='utf-8') as file:

                        return json.load(file)

                except (OSError, ValueError):

                    pass  # unreadable or half-written cache entry, just regenerate it

            async with semaphore:

                result = await SwaggerGenerationAgent.run(context, worker_model, parser_model, target, *args, extra)

            if store:

                with open(store, 'w', encoding='utf-8') as file:

                    json.dump(result, file, ensure_ascii=False)

            return result

        # ------------------------------------------------

        semaphore = asyncio.Semaphore(LLM_BATCH_SEMAPHORE)

        # limit concurrent connections to prevent risk controls

        # limit concurrent connections to prevent risk controls

        if cache:

            os.makedirs(cache, exist_ok=True)

        lhs = [solve_spec(semaphore, 'req', *args) for args in zip(plangs, frames, apiurls, methods, depends)]

        rhs = [solve_spec(semaphore, 'res', *args) for args in zip(plangs, frames, apiurls, methods, depends)]

        # a single endpoint raising used to abort the whole gather, throwing away every other endpoint in
        # the batch along with the hour of calls behind them. isolate it: a raised task becomes None and is
        # dropped by the verify below, exactly like an endpoint that burned all of its retries

        results = await asyncio.gather(*([] + lhs + rhs), return_exceptions=True)

        buffer = [None if isinstance(i, BaseException) else i for i in results]

        lhs = [buffer[len(depends) * 0 + i] for i in range(len(depends))]

        rhs = [buffer[len(depends) * 1 + i] for i in range(len(depends))]

        checker = lambda x, y: SwaggerGenerationAgent.Bean.verify(x, y)

        convert = lambda x, y: SwaggerGenerationAgent.Bean.wakeup(x, y)

        return [convert(x, y) if checker(x, y) else None for x, y in zip(lhs, rhs)]

    @staticmethod
    async def batch_run_full(
        context: FileHandler,
        worker_model: Model,
        parser_model: Model,
        plangs: list[str],  # for prompt template render
        frames: list[str],  # for prompt template render
        apiurls: list[str],  # for prompt template render
        methods: list[str],  # for prompt template render
        depends: list[list[Any]],  # for prompt template render
        extra: dict[str, Any] | None = None,
        cache: str | None = None  # directory to persist per-endpoint results into, None disables it
    ) -> list[Optional['SwaggerGenerationAgent.Bean']]:

        return await SwaggerGenerationAgent.__batch_run(
            context,  # add a comment to disable yapf format
            worker_model,  # add a comment to disable yapf format
            parser_model,  # add a comment to disable yapf format
            plangs,  # add a comment to disable yapf format
            frames,  # add a comment to disable yapf format
            apiurls,  # add a comment to disable yapf format
            methods,  # add a comment to disable yapf format
            depends,  # add a comment to disable yapf format
            extra,  # add a comment to disable yapf format
            cache  # add a comment to disable yapf format
        )

    @staticmethod
    async def batch_run_lite(
        context: FileHandler,
        worker_model: Model,
        parser_model: Model,
        plangs: str,  # use same value for each llm call
        frames: str,  # use same value for each llm call
        apiurls: list[str],  # for prompt template render
        methods: list[str],  # for prompt template render
        depends: list[list[Any]],  # for prompt template render
        extra: dict[str, Any] | None = None,
        cache: str | None = None  # directory to persist per-endpoint results into, None disables it
    ) -> list[Optional['SwaggerGenerationAgent.Bean']]:

        return await SwaggerGenerationAgent.__batch_run(
            context,  # add a comment to disable yapf format
            worker_model,  # add a comment to disable yapf format
            parser_model,  # add a comment to disable yapf format
            plangs,  # add a comment to disable yapf format
            frames,  # add a comment to disable yapf format
            apiurls,  # add a comment to disable yapf format
            methods,  # add a comment to disable yapf format
            depends,  # add a comment to disable yapf format
            extra,  # add a comment to disable yapf format
            cache  # add a comment to disable yapf format
        )

    @staticmethod
    async def run(
        context: FileHandler,
        worker_model: Model,
        parser_model: Model,
        target: str,  # for prompt template render
        plang: str,  # for prompt template render
        frame: str,  # for prompt template render
        apiurl: str,  # for prompt template render
        method: str,  # for prompt template render
        depend: list[Any],  # for prompt template render
        extra: dict[str, Any] | None = None
    ) -> list[Any] | dict[str, Any]:

        files, retries = context.get_files(), LLM_CORR_MAX_RETRIES

        origin = None  # do self refine for syntax and reference error

        repair = None  # do self refine for syntax and reference error

        errors = None  # do self refine for syntax and reference error

        from json_repair import loads

        while retries and (origin is None or errors):

            sys_msg = prompt.render(
                role=f'sys-{target}',
                files=files,  # use jinja2 to manage prompt templates
                plang=plang,  # use jinja2 to manage prompt templates
                frame=frame,  # use jinja2 to manage prompt templates
                origin=json.dumps(origin, indent=2, ensure_ascii=False) if origin else None,
                errors=json.dumps(errors, indent=2, ensure_ascii=False) if errors else None,
                apiurl=apiurl,  # use jinja2 to manage prompt templates
                method=method,  # use jinja2 to manage prompt templates
                depend=depend  # use jinja2 to manage prompt templates
            ).strip()

            usr_msg = prompt.render(
                role=f'usr-{target}',
                files=files,  # use jinja2 to manage prompt templates
                plang=plang,  # use jinja2 to manage prompt templates
                frame=frame,  # use jinja2 to manage prompt templates
                origin=json.dumps(origin, indent=2, ensure_ascii=False) if origin else None,
                errors=json.dumps(errors, indent=2, ensure_ascii=False) if errors else None,
                apiurl=apiurl,  # use jinja2 to manage prompt templates
                method=method,  # use jinja2 to manage prompt templates
                depend=depend  # use jinja2 to manage prompt templates
            ).strip()

            async def solve(with_tools: bool) -> Any:

                result = await Agent(
                    system_message=sys_msg,
                    model=worker_model or parser_model,
                    # parser_model=worker_model,
                    # parser_model=parser_model,
                    add_datetime_to_context=False,
                    add_location_to_context=False,
                    add_name_to_context=False,
                    tool_call_limit=LLM_TOOL_CALL_MAX_ITERATE,
                    tools=[context] if with_tools else [], **(extra or {})
                ).arun(usr_msg)

                return loads(str(result.content).rsplit('final generated result begins', maxsplit=1)[-1])

            try:

                # the user message already carries the full source of every implementing file, so the tools
                # are an optional extra here rather than the way in. small models treat them as the way in:
                # measured on nemotron-nano, every endpoint spent its whole budget reading files it had
                # already been given, got cut off by tool_call_limit mid-exploration and returned empty
                # content — 6 of 6 specs came back []. ask without tools first, which cannot stall, and keep
                # the tool pass as the rescue for the cases that genuinely need to chase a type across files

                # and bound both by the clock: agno accepts tool_call_limit but does not enforce it, so the
                # rescue pass can loop on tool calls forever. an endpoint that will not converge should cost
                # its own schema, not the run

                origin = await asyncio.wait_for(solve(False), LLM_AGENT_MAX_SECONDS)  # pylint: disable=cell-var-from-loop

                if not origin:

                    origin = await asyncio.wait_for(solve(True), LLM_AGENT_MAX_SECONDS)  # pylint: disable=cell-var-from-loop

            except Exception:  # pylint: disable=broad-exception-caught

                # a provider-side failure here is not a reason to lose the endpoint entirely. give up on its
                # schema and fall through to the empty default below, so the operation still reaches the
                # spec with a path and a method — a thin operation beats a missing one

                break

            retries, unref = retries - 1, unreference_json(origin)

            repair = unref[0]  # collect errors and replace them to {}

            errors = unref[1]  # collect errors and replace them to {}

        return repair or (
            [] if target == 'req' else
            {} if target == 'res' else
            False  # unexpected
        )
