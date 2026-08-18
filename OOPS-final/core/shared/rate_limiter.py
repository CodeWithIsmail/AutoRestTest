from core.libraries import *


class LLMRateLimiter:

    __rpm_limit: int

    __lock: asyncio.Lock

    __timestamps: 'collections.deque[float]'

    def __init__(self: Self, rpm_limit: int):

        self.__rpm_limit = rpm_limit

        self.__lock = asyncio.Lock()

        self.__timestamps = collections.deque()

    def tighten(self: Self, rpm_limit: int) -> None:

        self.__rpm_limit = min(self.__rpm_limit, rpm_limit)  # never loosen, only ever tighten

    async def acquire(self: Self) -> None:

        async with self.__lock:  # global serialization point == the pacing mechanism itself

            while True:

                now = time.monotonic()

                while self.__timestamps and now - self.__timestamps[0] >= 60.0:

                    self.__timestamps.popleft()

                if len(self.__timestamps) < self.__rpm_limit:

                    self.__timestamps.append(now)

                    return

                await asyncio.sleep(60.0 - (now - self.__timestamps[0]) + 0.05)


__registry: dict[str, LLMRateLimiter] = {}


def get_rate_limiter(key: str, rpm_limit: int) -> LLMRateLimiter:

    # process-wide singleton per model key; sync function, safe to call from
    # LLMFactory.build() before any await happens

    if key not in __registry:

        __registry[key] = LLMRateLimiter(rpm_limit)

    else:

        __registry[key].tighten(rpm_limit)

    return __registry[key]
