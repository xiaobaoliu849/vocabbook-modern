"""limit_service daily quota must be atomic under concurrency.

Previously check+consume was two transactions: concurrent first-use raced
the user_limits.feature UNIQUE insert into an uncaught IntegrityError (500),
and N requests all reading max-1 could each increment past the daily cap.
The quota is now one conditional upsert; these tests pin that behavior.
"""
import asyncio
import threading
from datetime import datetime, timedelta

import pytest

from models.database import DatabaseManager
from services.limit_service import LimitException, LimitService


@pytest.fixture()
def service(tmp_path):
    db = DatabaseManager(
        db_path=str(tmp_path / "vocab.db"),
        json_path=str(tmp_path / "missing.json"),
    )
    try:
        svc = LimitService(db)
        svc.LIMITS = {"ai_chat": 3}
        yield db, svc
    finally:
        db.close_all_connections()


def test_concurrent_first_use_never_crashes_or_exceeds_cap(service):
    db, svc = service
    results, errors = [], []
    barrier = threading.Barrier(8)

    def worker():
        try:
            barrier.wait(timeout=10)
            results.append(svc._consume("ai_chat", 3))
        except Exception as exc:  # noqa: BLE001 - the old bug surfaced here
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert errors == []
    # Exactly three consumers take a unit (counts 1..3); the rest are told
    # the quota was spent and read back the untouched full counter.
    assert sorted(used for consumed, used in results if consumed) == [1, 2, 3]
    assert all(not consumed for consumed, used in results if not consumed)
    assert all(used == 3 for consumed, used in results if not consumed)
    row = db.execute(
        "SELECT used_count FROM user_limits WHERE feature = 'ai_chat'",
        fetch=True,
        commit=False,
    )
    assert row[0][0] == 3


def test_check_and_consume_raises_once_cap_reached(service):
    _, svc = service

    async def consume():
        return await svc.check_and_consume("ai_chat")

    for _ in range(3):
        assert asyncio.run(consume()) is True
    with pytest.raises(LimitException):
        asyncio.run(consume())
    # Rejected attempts must not push the counter past the cap.
    assert svc._get_effective_used("ai_chat") == 3


def test_day_rollover_resets_counter(service):
    db, svc = service
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    db.execute(
        "INSERT INTO user_limits (feature, used_count, last_reset_date) VALUES (?, ?, ?)",
        ("ai_chat", 99, yesterday),
        fetch=False,
        commit=True,
    )
    consumed, used = svc._consume("ai_chat", 3)
    assert consumed is True
    assert used == 1


def test_get_remaining_is_read_only(service):
    db, svc = service
    assert svc.get_remaining("ai_chat")["remaining"] == 3
    # Reading must not create the row (old _reset_if_needed inserted on read).
    row = db.execute(
        "SELECT COUNT(*) FROM user_limits WHERE feature = 'ai_chat'",
        fetch=True,
        commit=False,
    )
    assert row[0][0] == 0
