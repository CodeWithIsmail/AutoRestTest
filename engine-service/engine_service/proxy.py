"""Recording reverse-proxy used to capture every request the engine sends.

Instead of pointing the engine at the real target API, the engine-service
injects a proxy URL (``http://127.0.0.1:<port>/proxy/<job_id>``) into the spec's
``servers``. Every request the engine makes therefore lands on this service; the
proxy forwards it verbatim to the real target, returns the real response to the
engine, and records the full request/response pair so the platform can show the
user exactly what was sent and received.

The engine (autoresttest-core) is still a black box — we intercept at the
network boundary, not in its code.
"""

from __future__ import annotations

import re
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

import yaml

# Cap on how many characters of a single request/response body we store. Real
# payloads are far smaller; this only guards against a pathological body blowing
# up storage. Truncation is flagged per record so the UI can say so.
MAX_BODY_CHARS = 100_000

# Request headers we must not forward as-is (host is rewritten; length/encoding
# are recomputed by urllib; hop-by-hop headers don't survive a proxy).
_DROP_REQUEST_HEADERS = {
    "host",
    "content-length",
    "connection",
    "accept-encoding",  # force an unencoded response so we can log plain text
    "proxy-connection",
}

# Response headers that describe the transfer, not the payload — drop so Flask
# can set them correctly for the hop back to the engine.
_DROP_RESPONSE_HEADERS = {
    "content-length",
    "transfer-encoding",
    "content-encoding",
    "connection",
    "keep-alive",
}

_MAPPED_METHODS = ("get", "post", "put", "patch", "delete", "head", "options")


def _truncate(raw: bytes) -> Tuple[str, bool]:
    """Decode bytes to text and truncate to MAX_BODY_CHARS, flagging if cut."""
    text = raw.decode("utf-8", errors="replace")
    if len(text) > MAX_BODY_CHARS:
        return text[:MAX_BODY_CHARS], True
    return text, False


class PathMatcher:
    """Maps a concrete request path (``/users/5``) back to the spec's templated
    path (``/users/{id}``) for the given method, so captured requests can be
    attributed to an endpoint row."""

    def __init__(self, spec_text: str) -> None:
        spec = yaml.safe_load(spec_text) or {}
        paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
        # (template, methods, compiled_regex, specificity)
        self._entries: List[Tuple[str, set, "re.Pattern[str]", int]] = []
        for template, item in paths.items():
            if not isinstance(item, dict):
                continue
            methods = {
                m.upper() for m in item.keys() if m.lower() in _MAPPED_METHODS
            }
            if not methods:
                continue
            regex = self._compile(template)
            # More literal (fewer {param}) segments = more specific = preferred.
            specificity = template.count("{")
            self._entries.append((template, methods, regex, specificity))
        # Try most-specific templates first so /users/me beats /users/{id}.
        self._entries.sort(key=lambda e: e[3])

    @staticmethod
    def _compile(template: str) -> "re.Pattern[str]":
        # Split on {param} tokens, escaping the literal parts and replacing each
        # placeholder with a non-slash segment matcher.
        parts = re.split(r"(\{[^/}]+\})", template)
        out = [
            "[^/]+" if re.fullmatch(r"\{[^/}]+\}", p) else re.escape(p)
            for p in parts
        ]
        return re.compile("^" + "".join(out) + "/?$")

    def match(self, method: str, raw_path: str) -> Optional[str]:
        path = "/" + raw_path.strip("/") if raw_path.strip("/") else "/"
        m = method.upper()
        for template, methods, regex, _spec in self._entries:
            if m in methods and regex.match(path):
                return template
        return None


def forward(
    target: str,
    subpath: str,
    query_string: bytes,
    method: str,
    headers: Dict[str, str],
    body: bytes,
    timeout: float = 60.0,
) -> Dict[str, Any]:
    """Forward one request to the real target and return a capture record.

    Never raises for HTTP/transport errors — a failed forward is itself a
    captured result (e.g. status 502 for an unreachable target), so the user
    still sees what happened.
    """
    base = target.rstrip("/")
    tail = subpath.lstrip("/")
    url = f"{base}/{tail}" if tail else base
    if query_string:
        url = f"{url}?{query_string.decode('latin-1')}"

    fwd_headers = {
        k: v for k, v in headers.items() if k.lower() not in _DROP_REQUEST_HEADERS
    }
    req_body_text, req_trunc = _truncate(body or b"")

    record: Dict[str, Any] = {
        "method": method.upper(),
        "url": url,
        "requestHeaders": fwd_headers,
        "requestBody": req_body_text,
        "requestTruncated": req_trunc,
    }

    started = time.monotonic()
    try:
        req = urllib.request.Request(
            url=url,
            data=body if body else None,
            headers=fwd_headers,
            method=method.upper(),
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            resp_headers = dict(resp.getheaders())
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        # A 4xx/5xx from the target is a normal, capturable outcome.
        status = exc.code
        resp_headers = dict(exc.headers.items()) if exc.headers else {}
        raw = exc.read() if hasattr(exc, "read") else b""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        # Target unreachable / timed out — synthesize a gateway error record.
        status = 502
        resp_headers = {"X-Proxy-Error": str(exc)[:200]}
        raw = f"Proxy could not reach target: {exc}".encode("utf-8")

    duration_ms = int((time.monotonic() - started) * 1000)
    resp_body_text, resp_trunc = _truncate(raw)

    record.update(
        {
            "statusCode": status,
            "durationMs": duration_ms,
            "responseHeaders": {
                k: v
                for k, v in resp_headers.items()
                if k.lower() not in _DROP_RESPONSE_HEADERS
            },
            "responseBody": resp_body_text,
            "responseTruncated": resp_trunc,
            "_returnHeaders": {
                k: v
                for k, v in resp_headers.items()
                if k.lower() not in _DROP_RESPONSE_HEADERS
            },
            "_returnBody": raw,
            "_returnStatus": status,
        }
    )
    return record
