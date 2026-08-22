"""Lightweight fixed-window rate limiting for auth endpoints.

In-memory only: state resets on restart and is not shared across workers.
That is acceptable here because the service runs as a single uvicorn process
and the goal is to blunt brute-force / bulk-registration attempts, not to be
a distributed limiter.
"""
import hashlib
import logging
import threading
import time
from typing import Optional

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Resolve the client IP, honoring proxy headers set by nginx.

    The service binds to 127.0.0.1 behind nginx, which sets
    X-Forwarded-For / X-Real-IP; if it is ever exposed directly,
    these headers could be spoofed, but rate limiting would then only
    degrade to best-effort DoS protection.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"


class FixedWindowRateLimiter:
    """Fixed-window counter limiter. Thread-safe, single-process.

    Memory is bounded two ways:
    - an expired-entry sweep runs at most once per window once the table is
      non-trivially large;
    - a hard capacity cap evicts the OLDEST entries FIFO. Spoofed
      X-Forwarded-For floods therefore cannot grow the table without bound
      (entries stay "fresh" inside a long window), and the per-request cost
      stays O(evicted) instead of rebuilding the whole table.
    """

    _HARD_CAP = 4096
    _SWEEP_THRESHOLD = 2048

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max(0, int(max_requests))
        self.window_seconds = max(1, int(window_seconds))
        # key -> (count, window_start); dict insertion order = oldest first.
        self._buckets: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()
        self._last_sweep = 0.0

    @property
    def disabled(self) -> bool:
        """max_requests=0 disables limiting entirely."""
        return self.max_requests == 0

    def check(self, key: str, now: Optional[float] = None) -> tuple[bool, int]:
        """Record one attempt for ``key``.

        Returns ``(allowed, retry_after_seconds)``. ``now`` exists so tests
        can control time; production callers omit it.
        """
        if self.disabled:
            return True, 0

        timestamp = time.monotonic() if now is None else now
        with self._lock:
            # Periodic sweep reclaims expired slots so long-lived legitimate
            # entries don't crowd out the capacity cap.
            if (
                len(self._buckets) > self._SWEEP_THRESHOLD
                and timestamp - self._last_sweep >= self.window_seconds
            ):
                self._buckets = {
                    k: entry
                    for k, entry in self._buckets.items()
                    if timestamp - entry[1] < self.window_seconds
                }
                self._last_sweep = timestamp

            # Hard cap: drop oldest entries first.
            while len(self._buckets) >= self._HARD_CAP:
                del self._buckets[next(iter(self._buckets))]

            count, window_start = self._buckets.get(key, (0, timestamp))
            if timestamp - window_start >= self.window_seconds:
                count, window_start = 0, timestamp
            count += 1
            self._buckets[key] = (count, window_start)

            if count > self.max_requests:
                retry_after = int(self.window_seconds - (timestamp - window_start)) + 1
                return False, max(1, retry_after)
            return True, 0


def enforce_rate_limit(limiter: FixedWindowRateLimiter, key: str, detail: str) -> None:
    """Raise 429 when the key exceeded its window budget."""
    allowed, retry_after = limiter.check(key)
    if not allowed:
        # Do not log the raw key: it contains the client IP and/or email.
        logger.warning("Auth rate limit exceeded (key digest=%s)", _digest(key))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )


def _digest(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
