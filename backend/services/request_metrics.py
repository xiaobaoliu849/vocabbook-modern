from collections import defaultdict, deque
from threading import Lock
from time import time
from typing import Deque, Dict, Iterable
import math


def classify_request_bucket(path: str) -> str:
    if path.startswith("/api/ai/chat"):
        return "chat"
    if path.startswith("/api/review"):
        return "review"
    if path.startswith("/api/dict"):
        return "dictionary"
    if path.startswith("/api/ai"):
        return "ai"
    if path.startswith("/api/stats"):
        return "stats"
    return "other"


def resolve_route_label(scope: dict, fallback_path: str) -> str:
    route = scope.get("route")
    route_path = getattr(route, "path", None)
    return route_path or fallback_path


class RequestMetricsRecorder:
    """Keep a bounded in-memory sample window for request timing analysis."""

    def __init__(self, max_samples_per_series: int = 500) -> None:
        self.max_samples_per_series = max_samples_per_series
        self._bucket_samples: Dict[str, Deque[dict]] = defaultdict(
            lambda: deque(maxlen=max_samples_per_series)
        )
        self._route_samples: Dict[str, Deque[dict]] = defaultdict(
            lambda: deque(maxlen=max_samples_per_series)
        )
        self._lock = Lock()

    def record(
        self,
        *,
        bucket: str,
        route: str,
        method: str,
        duration_ms: float,
        status_code: int,
    ) -> None:
        sample = {
            "duration_ms": round(float(duration_ms), 3),
            "status_code": int(status_code),
            "timestamp": time(),
        }
        route_key = f"{method.upper()} {route}"
        with self._lock:
            self._bucket_samples[bucket].append(sample)
            self._route_samples[route_key].append(sample)

    def snapshot(self) -> dict:
        with self._lock:
            bucket_items = {key: list(value) for key, value in self._bucket_samples.items()}
            route_items = {key: list(value) for key, value in self._route_samples.items()}

        return {
            "window": {
                "max_samples_per_series": self.max_samples_per_series,
            },
            "buckets": {key: self._summarize(value) for key, value in bucket_items.items()},
            "routes": {key: self._summarize(value) for key, value in route_items.items()},
        }

    @staticmethod
    def _percentile(values: list[float], percentile: float) -> float:
        if not values:
            return 0.0
        sorted_values = sorted(values)
        rank = max(0, math.ceil((percentile / 100.0) * len(sorted_values)) - 1)
        return round(sorted_values[rank], 3)

    @classmethod
    def _summarize(cls, samples: Iterable[dict]) -> dict:
        sample_list = list(samples)
        durations = [float(item["duration_ms"]) for item in sample_list]
        if not durations:
            return {
                "count": 0,
                "avg_ms": 0.0,
                "p50_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "max_ms": 0.0,
                "error_count": 0,
                "last_status_code": 0,
                "last_seen_at": None,
            }

        error_count = sum(1 for item in sample_list if int(item["status_code"]) >= 500)
        avg_ms = round(sum(durations) / len(durations), 3)
        last_sample = max(sample_list, key=lambda item: item["timestamp"])

        return {
            "count": len(sample_list),
            "avg_ms": avg_ms,
            "p50_ms": cls._percentile(durations, 50),
            "p95_ms": cls._percentile(durations, 95),
            "p99_ms": cls._percentile(durations, 99),
            "max_ms": round(max(durations), 3),
            "error_count": error_count,
            "last_status_code": int(last_sample["status_code"]),
            "last_seen_at": float(last_sample["timestamp"]),
        }


request_metrics = RequestMetricsRecorder()
