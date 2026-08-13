import asyncio
import json
import os
import traceback

import dotenv

from core.pipeline import MainPipeline
from core.shared import LLMFactory

CHECKPOINT = 'log/careerstory-backend/_checkpoints/add_openapi_operation'

MODEL = 'nvidia/nemotron-3-nano-30b-a3b'

NO_THINKING = {'chat_template_kwargs': {'thinking': False}}


async def main() -> None:

    dotenv.load_dotenv()

    # the pickle carries instance state only — methods come from the current class definition, so bug fixes
    # made since the checkpoint was written do apply to the resumed run

    pipeline = MainPipeline.load_states(CHECKPOINT)

    print(f'resumed from {CHECKPOINT}, next step -> {pipeline.get_state()}', flush=True)

    # the pickle also carries the Config the original run was built with, so the per-stage timeout added to
    # run_careerstory.py afterwards would not reach a resumed run — graft it on here. Config is frozen, hence
    # model_copy + object.__setattr__ rather than plain assignment

    config = getattr(pipeline, '_MainPipeline__common_config')

    patched = config.model_copy(update={
        'swagger_generation_worker_client': LLMFactory(MODEL, extra_body=NO_THINKING, timeout=10 * 60),
        'swagger_generation_parser_client': LLMFactory(MODEL, extra_body=NO_THINKING, timeout=10 * 60)
    })

    object.__setattr__(pipeline, '_MainPipeline__common_config', patched)

    def checkpoint(context: MainPipeline, done: str, _: str) -> None:

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

    os.makedirs('run/careerstory-nim', exist_ok=True)

    with open('run/careerstory-nim/careerstory-backend.op.json', 'w', encoding='utf-8') as file:
        file.write(payload)

    print('done -> run/careerstory-nim/careerstory-backend.op.json')


if __name__ == '__main__':

    asyncio.run(main())
