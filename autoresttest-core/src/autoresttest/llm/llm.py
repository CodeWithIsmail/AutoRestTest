import os
import random
import sys
import threading
import time
from dataclasses import dataclass

from dotenv import load_dotenv
from openai import OpenAI

from autoresttest.config import get_config
from autoresttest.prompts.system_prompts import DEFAULT_SYSTEM_MESSAGE
from autoresttest.utils import encode_dictionary

CONFIG = get_config()

load_dotenv()

# Per-call ceiling, in seconds. Sized for a slow provider rather than a fast one:
# a 70B model on a queued free tier (e.g. NVIDIA NIM) has been measured at 2-4
# minutes for ~250 output tokens, so anything much tighter would abort healthy
# calls. Override with LLM_TIMEOUT when pointing at a faster endpoint.
LLM_REQUEST_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "420"))

# Attempts per call, and the base for exponential backoff between them. The old
# values (3 attempts, 1s base) were sized for a transient blip: against a
# rate-limited free tier they burned all three retries inside three seconds and
# gave up while the provider was still shedding load. 5 attempts backing off
# 5/10/20/40s rides out a rate-limit window instead of failing through it.
LLM_MAX_ATTEMPTS = int(os.getenv("LLM_MAX_ATTEMPTS", "5"))
LLM_RETRY_BASE_DELAY = float(os.getenv("LLM_RETRY_BASE_DELAY", "5"))
# Ceiling per wait, so one pathological Retry-After cannot stall a whole run.
LLM_RETRY_MAX_DELAY = float(os.getenv("LLM_RETRY_MAX_DELAY", "60"))


def _retry_delay(exc: Exception, attempt: int) -> float:
    """How long to wait before retrying `exc`.

    Prefers the provider's own `Retry-After` when it sends one — guessing longer
    than instructed wastes time, guessing shorter earns another 429. Falls back
    to exponential backoff, with jitter so that concurrent value-generation
    workers rejected together don't all retry in lockstep.
    """
    retry_after = None
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is not None:
        try:
            raw = headers.get("retry-after")
            retry_after = float(raw) if raw is not None else None
        except (TypeError, ValueError):
            retry_after = None

    delay = retry_after if retry_after is not None else (
        LLM_RETRY_BASE_DELAY * (2**attempt)
    )
    delay = min(delay, LLM_RETRY_MAX_DELAY)
    return delay + random.uniform(0, delay * 0.25)


@dataclass
class TokenCounter:
    input_tokens: int = 0
    output_tokens: int = 0


class LanguageModel:
    input_tokens = 0
    output_tokens = 0
    cache = {}

    # Thread-safety locks for parallel value generation
    _cache_lock = threading.RLock()
    _token_lock = threading.RLock()

    # Client-side rate limiting. Every LLM call funnels through query(), so a
    # single min-interval throttle here caps outgoing requests per minute across
    # all worker threads (parallel Q-table init + the MARL loop). Needed for
    # providers with strict free-tier limits, e.g. NVIDIA NIM at 40 RPM.
    _rate_lock = threading.Lock()
    _last_request_ts = 0.0
    _min_interval = (
        60.0 / CONFIG.llm_rpm_limit if CONFIG.llm_rpm_limit > 0 else 0.0
    )

    @classmethod
    def _throttle(cls) -> None:
        """Block until enough time has elapsed to respect the RPM limit."""
        if cls._min_interval <= 0:
            return
        with cls._rate_lock:
            wait = cls._last_request_ts + cls._min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            cls._last_request_ts = time.monotonic()

    @staticmethod
    def get_tokens() -> TokenCounter:
        return TokenCounter(
            input_tokens=LanguageModel.input_tokens,
            output_tokens=LanguageModel.output_tokens,
        )

    def __init__(
        self,
        engine=CONFIG.openai_llm_engine,
        temperature=CONFIG.creative_temperature,
        max_tokens=CONFIG.llm_max_tokens,
    ):
        self.api_key = os.getenv("API_KEY")
        if self.api_key is None or self.api_key.strip() == "":
            raise ValueError(
                "API key is required for OpenAI language model, found None or empty string."
            )
        # The SDK defaults to a 600s timeout and 2 internal retries. Combined
        # with the 3 attempts below, one query() could block for over an hour on
        # a stalled provider -- long enough to blow a run's whole budget in the
        # un-timed setup phases. Cap the per-call wait and let the retry loop
        # here (which logs, and backs off) be the only retry layer.
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=CONFIG.llm_api_base,
            timeout=LLM_REQUEST_TIMEOUT,
            max_retries=0,
        )
        self.engine = engine
        self.temperature = temperature
        self.max_tokens = max_tokens

    def _generate_cache_key(self, user_message, system_message, json_mode):
        key_data = {
            "user_message": user_message,
            "system_message": system_message,
            "json_mode": json_mode,
            "engine": self.engine,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        return encode_dictionary(key_data)

    def query(
        self, user_message, system_message=DEFAULT_SYSTEM_MESSAGE, json_mode=False
    ) -> str:
        cache_key = self._generate_cache_key(user_message, system_message, json_mode)

        # Thread-safe cache read
        with LanguageModel._cache_lock:
            if cache_key in LanguageModel.cache:
                return LanguageModel.cache[cache_key]

        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ]

        kwargs = {
            "model": self.engine,
            "messages": messages,
            "temperature": self.temperature,
        }

        if self.max_tokens != -1:
            kwargs["max_tokens"] = self.max_tokens

        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        for attempt in range(LLM_MAX_ATTEMPTS):
            try:
                self._throttle()
                response = self.client.chat.completions.create(**kwargs)
                break
            except Exception as e:
                # Logged to stderr, not stdout: stdout belongs to the Rich TUI,
                # and silence here is what made a provider stalling for minutes
                # per call indistinguishable from the engine simply being slow.
                if attempt < LLM_MAX_ATTEMPTS - 1:
                    delay = _retry_delay(e, attempt)
                    print(
                        f"[LLM] call failed (attempt {attempt + 1}/"
                        f"{LLM_MAX_ATTEMPTS}): {type(e).__name__}: {e} "
                        f"- retrying in {delay:.1f}s",
                        file=sys.stderr,
                        flush=True,
                    )
                    time.sleep(delay)
                else:
                    # Giving up is not free: the caller gets "", which becomes an
                    # empty value table for that operation and, downstream,
                    # requests sent with unsubstituted path parameters.
                    print(
                        f"[LLM] call failed after {LLM_MAX_ATTEMPTS} attempts: "
                        f"{type(e).__name__}: {e} - giving up (this operation "
                        f"will have no generated values)",
                        file=sys.stderr,
                        flush=True,
                    )
                    return ""

        input_tokens = 0
        output_tokens = 0
        if response.usage is not None:
            input_tokens = getattr(response.usage, "prompt_tokens", 0) or 0
            output_tokens = getattr(response.usage, "completion_tokens", 0) or 0

        # print(f"[LLM] Input tokens: {input_tokens}, Output tokens: {output_tokens}")

        # Thread-safe token updates
        with LanguageModel._token_lock:
            LanguageModel.input_tokens += input_tokens
            LanguageModel.output_tokens += output_tokens

        if not response.choices:
            return ""
        content = response.choices[0].message.content
        result = content.strip() if content else ""

        # Thread-safe cache write
        with LanguageModel._cache_lock:
            LanguageModel.cache[cache_key] = result

        return result
