from services.request_metrics import RequestMetricsRecorder, classify_request_bucket


def test_request_metrics_snapshot_reports_bucket_percentiles():
    recorder = RequestMetricsRecorder(max_samples_per_series=10)

    for duration_ms in [10, 20, 30, 40, 50]:
        recorder.record(
            bucket="review",
            route="/api/review/due-count",
            method="GET",
            duration_ms=duration_ms,
            status_code=200,
        )

    snapshot = recorder.snapshot()
    review_metrics = snapshot["buckets"]["review"]
    route_metrics = snapshot["routes"]["GET /api/review/due-count"]

    assert review_metrics["count"] == 5
    assert review_metrics["p50_ms"] == 30.0
    assert review_metrics["p95_ms"] == 50.0
    assert review_metrics["error_count"] == 0
    assert route_metrics["max_ms"] == 50.0


def test_request_bucket_classifier_groups_hot_paths():
    assert classify_request_bucket("/api/ai/chat") == "chat"
    assert classify_request_bucket("/api/ai/chat/stream") == "chat"
    assert classify_request_bucket("/api/review/due-count") == "review"
    assert classify_request_bucket("/api/dict/search/test") == "dictionary"
    assert classify_request_bucket("/api/stats/request-timings") == "stats"
