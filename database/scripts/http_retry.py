"""
Shared HTTP retry/backoff helper for scripts that call external APIs
(TMDB, OMDb) inside long-running loops.

Used to avoid one flaky request (rate limit, timeout, transient 5xx)
turning into a lost row or a fully failed pipeline step.
"""

import random
import time
from typing import Any, Dict, MutableMapping, Optional

import requests

from log_setup import get_logger

log = get_logger("http_retry")

# Status codes worth retrying: rate limiting and server-side errors.
# Other 4xx (400, 401, 404, ...) are treated as final — retrying won't help.
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def get_with_retry(
    session: requests.Session,
    url: str,
    params: Optional[Dict[str, Any]] = None,
    *,
    timeout: float = 15,
    max_retries: int = 3,
    stats: Optional[MutableMapping[str, int]] = None,
    label: str = "API",
) -> Optional[requests.Response]:
    """
    GET with retry/backoff on rate limiting (429) and server errors (5xx),
    and on transient network exceptions (timeouts, connection resets).

    Returns the Response object once we get a status that isn't worth
    retrying (2xx, or a non-retryable 4xx) so the caller can inspect the
    body/status itself. Returns None only if every attempt raised a
    network exception.
    """
    attempt = 0
    while True:
        attempt += 1
        try:
            resp = session.get(url, params=params, timeout=timeout)
        except requests.RequestException as e:
            if stats is not None:
                stats["request_exc"] = stats.get("request_exc", 0) + 1
            if attempt > max_retries:
                log.error(f"[{label}] request failed after {attempt} attempts: {e}")
                return None
            wait = _backoff_seconds(attempt)
            log.warning(
                f"[{label}] request error ({e}); retrying in {wait:.1f}s "
                f"(attempt {attempt}/{max_retries})"
            )
            time.sleep(wait)
            continue

        if stats is not None:
            _bump_stats(stats, resp.status_code)

        if resp.status_code not in RETRYABLE_STATUS or attempt > max_retries:
            return resp

        wait = _retry_after_seconds(resp) or _backoff_seconds(attempt)
        log.warning(
            f"[{label}] HTTP {resp.status_code}; retrying in {wait:.1f}s "
            f"(attempt {attempt}/{max_retries})"
        )
        time.sleep(wait)


def _retry_after_seconds(resp: requests.Response) -> Optional[float]:
    val = resp.headers.get("Retry-After")
    if not val:
        return None
    try:
        return max(0.0, float(val))
    except ValueError:
        return None


def _backoff_seconds(attempt: int) -> float:
    return min(2 ** attempt, 20) + random.uniform(0, 0.5)


def _bump_stats(stats: MutableMapping[str, int], status_code: int) -> None:
    if status_code == 429:
        stats["http_429"] = stats.get("http_429", 0) + 1
    elif 400 <= status_code < 500:
        stats["http_4xx"] = stats.get("http_4xx", 0) + 1
    elif status_code >= 500:
        stats["http_5xx"] = stats.get("http_5xx", 0) + 1
