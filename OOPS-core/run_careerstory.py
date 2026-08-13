import asyncio
import json
import os
import traceback

import dotenv

from core.pipeline import MainPipeline
from core.shared import LLMFactory

MODEL = 'nvidia/nemotron-3-nano-30b-a3b'

# nemotron reasons before answering and the reasoning comes out of the completion budget, so a one-line
# extraction cost 1069 tokens / 25s and short max_tokens returned nothing but half-finished thoughts.
# turning it off gave the same answer in 26 tokens / 0.7s — the pipeline wants throughput, not deliberation

NO_THINKING = {'chat_template_kwargs': {'thinking': False}}


async def main() -> None:

    dotenv.load_dotenv()

    pipeline = MainPipeline(
        title='CareerStory Backend API',
        version='1.0.0',
        project=r'D:\CareerStory\CareerStory-backend',
        log_base='log/careerstory-backend',
        upg_base='log/careerstory-backend',
        config=MainPipeline.Config(
            # model choice on NIM free tier, measured rather than assumed:
            #   3.3-70b            never responds at all (ReadTimeout on every call)
            #   3.1-70b            429s even at concurrency 1, ~5 rpm usable
            #   nemotron-3-super   reasons best, but ~19 rpm and earns an account-level cooldown
            #                      that stalls a run for hours — unusable for finishing in one sitting
            #   3.1-8b             was the pick until NVIDIA's meta/llama-* deployments went DEGRADED
            #                      ('function cannot be invoked', then dead sockets on every call)
            #   nemotron-3-nano    serving fine while the llama endpoints are down, emits correct tool
            #                      calls and json_schema output. it is a reasoning model, so see below
            default_llm_worker_client=LLMFactory(MODEL, extra_body=NO_THINKING),
            default_llm_parser_client=LLMFactory(MODEL, extra_body=NO_THINKING),

            # this stage emits a full request/response schema per operation (6k+ tokens) and does not fit the
            # default timeout — at 3 min it lost 23 of 39 operations to 'Request timed out'

            swagger_generation_worker_client=LLMFactory(MODEL, extra_body=NO_THINKING, timeout=10 * 60),
            swagger_generation_parser_client=LLMFactory(MODEL, extra_body=NO_THINKING, timeout=10 * 60),
            ignore_sufx=['env'],
            ignore_path=['node_modules', 'dist', 'coverage', '.claude', 'careerstory-openapi', '.git']
        )
    )

    def checkpoint(context: MainPipeline, done: str, _: str) -> None:

        # without this a failure in a late step throws away every llm call the earlier steps paid for.
        # dump after each one so a rerun can resume from the last good state instead of from zero.

        target = f'log/careerstory-backend/_checkpoints/{done}'

        os.makedirs(target, exist_ok=True)

        context.dump_states(target)

        print(f'[checkpoint] {done} -> {target}', flush=True)

    try:

        oas = await pipeline.run(on_complete=checkpoint)

        payload = oas.model_dump_json(exclude_unset=True, by_alias=True, indent=2)

    except Exception:  # pylint: disable=broad-exception-caught

        # everything expensive is already done by the time run() reaches upgrade_apidoc (a java shell-out)
        # and rebuild_apidoc. either of those failing used to end the run with no artifact at all, which is
        # the worst possible trade — fall back to the swagger 2.0 document the builder accumulated instead

        traceback.print_exc()

        builder = getattr(pipeline, '_MainPipeline__oas_builder')

        payload = json.dumps(getattr(builder, '_OASBuilder__payload'), indent=2, ensure_ascii=False)

        print('!! oas upgrade failed, falling back to the raw swagger 2.0 payload', flush=True)

    # the pipeline creates its own log dirs, but nothing creates the output dir — without this a cleaned
    # checkout loses a full run to a FileNotFoundError on the very last line

    os.makedirs('run/careerstory-nim', exist_ok=True)

    with open('run/careerstory-nim/careerstory-backend.coldrun.json', 'w', encoding='utf-8') as file:
        file.write(payload)

    print('done -> run/careerstory-nim/careerstory-backend.coldrun.json')


if __name__ == '__main__':

    asyncio.run(main())
