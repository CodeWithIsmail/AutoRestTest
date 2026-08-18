from core.constants import *

from core.libraries import *

from core.pipeline import MainPipeline

from core.shared import LLMFactory


#  .----------------.  .----------------.  .----------------.
# | .--------------. || .--------------. || .--------------. |
# | |     ____     | || |  _______     | || |   ________   | |
# | |   .'    `.   | || | |_   __ \    | || |  |  __   _|  | |
# | |  /  .--.  \  | || |   | |__) |   | || |  |_/  / /    | |
# | |  | |    | |  | || |   |  __ /    | || |     .'.' _   | |
# | |  \  `--'  /  | || |  _| |  \ \_  | || |   _/ /__/ |  | |
# | |   `.____.'   | || | |____| |___| | || |  |________|  | |
# | |              | || |              | || |              | |
# | '--------------' || '--------------' || '--------------' |
#  '----------------'  '----------------'  '----------------'

#  .----------------.  .----------------.  .----------------.
# | .--------------. || .--------------. || .--------------. |
# | |     ____     | || |  _______     | || |   ________   | |
# | |   .'    `.   | || | |_   __ \    | || |  |  __   _|  | |
# | |  /  .--.  \  | || |   | |__) |   | || |  |_/  / /    | |
# | |  | |    | |  | || |   |  __ /    | || |     .'.' _   | |
# | |  \  `--'  /  | || |  _| |  \ \_  | || |   _/ /__/ |  | |
# | |   `.____.'   | || | |____| |___| | || |  |________|  | |
# | |              | || |              | || |              | |
# | '--------------' || '--------------' || '--------------' |
#  '----------------'  '----------------'  '----------------'


async def run_sample() -> None:

    log_base = upg_base = 'log/pub-sample-gemini-3-5-flash-lite'

    os.makedirs(log_base, exist_ok=True)

    shared_client = LLMFactory('gemini-3.5-flash-lite', rpm_limit=12)  # ~20% headroom below the 15 rpm free-tier cap

    pipeline = MainPipeline(
        title='Auto-generated OAS of Sample using OOPS',
        version='1.0.0',
        project='D:/sample',
        log_base=log_base,
        upg_base=upg_base,
        config=MainPipeline.Config(
            default_llm_worker_client=shared_client,
            default_llm_parser_client=shared_client,
            ignore_sufx=['env'],  # avoid leaking D:/sample/.env contents into prompts
            ignore_path=None,
            llm_extra_kwargs={'retries': 3, 'delay_between_retries': 5, 'exponential_backoff': True}
        )
    )

    oas = await pipeline.run()

    pipeline.dump_states(log_base)

    with open(f'{log_base}/oas.json', 'w', encoding='utf-8') as file:
        file.write(oas.model_dump_json(exclude_unset=True, by_alias=True, indent=4))

    with open(f'{log_base}/oas.yaml', 'w', encoding='utf-8') as file:
        yaml.dump(
            oas.model_dump(mode='json', exclude_unset=True, by_alias=True),  # mode='json' forces enums/etc. to plain primitives
            file,
            default_flow_style=False,  # readable block style, not inline {}/[]
            sort_keys=False,  # preserve the same key order as oas.json
            allow_unicode=True
        )

    print(f'[oops] finished: plang={pipeline.get_plang()} frame={pipeline.get_frame()}')
    print(f'[oops] oas written to {log_base}/oas.json and {log_base}/oas.yaml')


async def main() -> None:

    dotenv.load_dotenv()

    assert MainPipeline

    await run_sample()


if __name__ == '__main__':

    asyncio.run(main())
