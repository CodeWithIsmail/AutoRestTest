from core.libraries import *
from core.constants import *


class RateLimiter:

    __capacity: int

    __interval: float

    __timestamps: list[float]

    __lock: asyncio.Lock

    def __init__(self: Self, capacity: int, interval: float = 60.0):

        self.__capacity, self.__interval = capacity, interval

        self.__timestamps, self.__lock = [], asyncio.Lock()

    async def acquire(self: Self) -> None:

        while True:

            async with self.__lock:

                now = time.monotonic()

                self.__timestamps = [i for i in self.__timestamps if now - i < self.__interval]

                if len(self.__timestamps) < self.__capacity:

                    self.__timestamps.append(now)

                    return

                wait = self.__timestamps[0] + self.__interval - now

            await asyncio.sleep(wait)
