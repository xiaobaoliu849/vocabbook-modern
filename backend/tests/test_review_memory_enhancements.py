import asyncio
import json
import os
import time
from tempfile import TemporaryDirectory

import pytest

from models.database import DatabaseManager
from routers.ai import (
    _resolve_chat_owner_key,
    _can_use_evermem as _ai_can_use_evermem,
    _prime_evermem_runtime as _prime_ai_evermem_runtime,
)
from routers.review import (
    ReviewSubmit,
    _resolve_evermem_user_id,
    _can_use_evermem as _review_can_use_evermem,
    _prime_evermem_runtime,
    get_due_count,
    submit_review,
)
from services.review_service import ReviewService

try:
    import services.evermem_config as evermem_config
except Exception:
    evermem_config = None


def _build_temp_db():
    temp_dir = TemporaryDirectory()
    db_path = os.path.join(temp_dir.name, "test.db")
    json_path = os.path.join(temp_dir.name, "missing.json")
    db = DatabaseManager(db_path=db_path, json_path=json_path)
    return temp_dir, db


def test_due_filter_includes_due_mastered_words():
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "alpha", "meaning": "test"})
        db.execute(
            "UPDATE words SET mastered = 1, next_review_time = ? WHERE word = ?",
            (time.time() - 120, "alpha"),
        )

        words, _total = db.search_words(status_filter="due", limit=20, offset=0)
        assert any(item["word"] == "alpha" for item in words)
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_error_count_can_decay_and_never_go_negative():
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "beta", "meaning": "test"})
        db.execute("UPDATE words SET error_count = 2 WHERE word = ?", ("beta",))

        # High ratings should decay difficult score.
        db.update_sm2_status("beta", easiness=2.5, interval=1, repetitions=1, next_time=time.time() + 86400, rating=5)
        error_count = db.execute(
            "SELECT error_count FROM words WHERE word = ?",
            ("beta",),
            fetch=True,
            commit=False,
        )[0][0]
        assert error_count == 1

        db.update_sm2_status("beta", easiness=2.5, interval=2, repetitions=2, next_time=time.time() + 86400, rating=4)
        db.update_sm2_status("beta", easiness=2.5, interval=3, repetitions=3, next_time=time.time() + 86400, rating=4)
        error_count = db.execute(
            "SELECT error_count FROM words WHERE word = ?",
            ("beta",),
            fetch=True,
            commit=False,
        )[0][0]
        assert error_count == 0
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_sm2_review_history_records_precise_review_timestamp():
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "delta", "meaning": "test"})
        db.update_sm2_status("delta", easiness=2.4, interval=1, repetitions=1, next_time=time.time() + 3600, rating=3)

        rows = db.execute(
            "SELECT review_date, reviewed_at, rating FROM review_history WHERE word_id = (SELECT id FROM words WHERE word = ?)",
            ("delta",),
            fetch=True,
            commit=False,
        )
        assert len(rows) == 1
        review_date, reviewed_at, rating = rows[0]
        assert review_date
        assert isinstance(reviewed_at, (int, float))
        assert reviewed_at > 0
        assert rating == 3
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_low_quality_uses_hour_level_retry_windows():
    now_ts = time.time()

    in_1_hours = (ReviewService.calculate_next_review_time(interval=1, quality=1) - now_ts) / 3600
    in_2_hours = (ReviewService.calculate_next_review_time(interval=1, quality=2) - now_ts) / 3600
    in_3_hours = (ReviewService.calculate_next_review_time(interval=1, quality=3) - now_ts) / 3600

    assert 7.5 <= in_1_hours <= 8.5
    assert 19.5 <= in_2_hours <= 20.5
    assert 23.0 <= in_3_hours <= 25.0


def test_learning_focus_summary_prioritizes_weak_words():
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "alpha", "meaning": "alpha meaning"})
        assert db.add_word({"word": "beta", "meaning": "beta meaning"})
        assert db.add_word({"word": "gamma", "meaning": "gamma meaning"})

        now_ts = time.time()
        db.execute(
            """
            UPDATE words
            SET review_count = 5, error_count = 3, easiness = 1.8, next_review_time = ?
            WHERE word = ?
            """,
            (now_ts - 300, "alpha"),
        )
        db.execute(
            """
            UPDATE words
            SET review_count = 4, error_count = 1, easiness = 2.0, next_review_time = ?
            WHERE word = ?
            """,
            (now_ts + 86400, "beta"),
        )
        db.execute(
            """
            UPDATE words
            SET review_count = 2, error_count = 0, easiness = 2.7, next_review_time = ?
            WHERE word = ?
            """,
            (now_ts + 86400, "gamma"),
        )

        summary = db.get_learning_focus_summary(limit=5)

        assert summary["due_count"] >= 1
        assert summary["difficult_count"] >= 2
        assert [item["word"] for item in summary["weak_words"]][:2] == ["alpha", "beta"]
        assert summary["weak_words"][0]["is_due"] is True
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_due_review_count_only_counts_due_words():
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "alpha", "meaning": "test"})
        assert db.add_word({"word": "beta", "meaning": "test"})
        db.execute("UPDATE words SET next_review_time = ? WHERE word = ?", (time.time() - 60, "alpha"))
        db.execute("UPDATE words SET next_review_time = ? WHERE word = ?", (time.time() + 3600, "beta"))

        assert db.get_due_review_count() == 1
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_submit_review_returns_remaining_due_count(monkeypatch):
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "alpha", "meaning": "test"})
        assert db.add_word({"word": "beta", "meaning": "test"})
        now_ts = time.time()
        db.execute("UPDATE words SET next_review_time = ?, review_count = 1 WHERE word = ?", (now_ts - 120, "alpha"))
        db.execute("UPDATE words SET next_review_time = ?, review_count = 1 WHERE word = ?", (now_ts - 120, "beta"))

        monkeypatch.setattr("routers.review.get_db", lambda: db)

        result = asyncio.run(
            submit_review(
                ReviewSubmit(word="alpha", quality=4, time_spent=0),
                authorization=None,
                x_client_id=None,
                x_evermem_enabled="false",
                x_evermem_url=None,
                x_evermem_key=None,
            )
        )

        assert result["word"] == "alpha"
        assert result["remaining_due_count"] == 1
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_guest_client_id_isolation_keys():
    owner_a = asyncio.run(_resolve_chat_owner_key(None, "device-A"))
    owner_b = asyncio.run(_resolve_chat_owner_key(None, "device-B"))
    review_user = _resolve_evermem_user_id(None, "device-A")

    assert owner_a.startswith("guest_")
    assert owner_b.startswith("guest_")
    assert owner_a != owner_b
    assert review_user.startswith("guest_")
    assert "device_a" in review_user


def test_evermem_requires_bearer_auth_for_chat_and_review():
    assert _ai_can_use_evermem(None) is False
    assert _ai_can_use_evermem("Basic abc123") is False
    assert _ai_can_use_evermem("Bearer ") is False
    assert _ai_can_use_evermem("Bearer jwt-token") is True

    assert _review_can_use_evermem(None) is False
    assert _review_can_use_evermem("Token abc123") is False
    assert _review_can_use_evermem("Bearer ") is False
    assert _review_can_use_evermem("Bearer jwt-token") is True


def test_evermem_key_not_persisted_to_disk(monkeypatch, tmp_path):
    if evermem_config is None:
        pytest.skip("evermemos dependency not installed in current environment")

    config_path = tmp_path / "evermem_config.json"

    class DummyEverMemService:
        def __init__(self, api_url: str, api_key: str):
            self.api_url = api_url
            self.api_key = api_key

    monkeypatch.setattr(evermem_config, "_CONFIG_PATH", str(config_path))
    monkeypatch.setattr(evermem_config, "EverMemService", DummyEverMemService)
    monkeypatch.delenv("EVERMEM_API_KEY", raising=False)

    evermem_config._cached_service = None
    evermem_config._cached_key = None
    evermem_config._cached_url = None

    evermem_config.save_config(enabled=True, url="https://api.evermind.ai", key="secret-key")
    persisted = json.loads(config_path.read_text(encoding="utf-8"))

    assert persisted["enabled"] is True
    assert persisted["url"] == "https://api.evermind.ai"
    assert persisted.get("key_persisted") is False
    assert "key" not in persisted

    # Runtime still works in current process via in-memory key.
    service = evermem_config.get_service()
    assert service is not None
    assert service.api_key == "secret-key"

    # Simulate restart: no in-memory key and no env key => no service.
    evermem_config._cached_service = None
    evermem_config._cached_key = None
    evermem_config._cached_url = None
    assert evermem_config.get_service() is None


def test_review_runtime_can_bootstrap_evermem_from_headers(monkeypatch):
    class DummyService:
        pass

    calls = []

    def fake_resolve_runtime_service(enabled: bool, url: str = None, key: str = None):
        calls.append((enabled, url, key))
        return DummyService()

    monkeypatch.setattr("services.evermem_config.resolve_runtime_service", fake_resolve_runtime_service)

    service, enabled = _prime_evermem_runtime(
        authorization="Bearer jwt-token",
        x_evermem_enabled="true",
        x_evermem_url="https://api.evermind.ai",
        x_evermem_key="secret-key",
    )

    assert enabled is True
    assert isinstance(service, DummyService)
    assert calls == [(True, "https://api.evermind.ai", "secret-key")]


def test_review_runtime_disables_evermem_when_header_off(monkeypatch):
    calls = []

    def fake_resolve_runtime_service(enabled: bool, url: str = None, key: str = None):
        calls.append((enabled, url, key))
        return None

    monkeypatch.setattr("services.evermem_config.resolve_runtime_service", fake_resolve_runtime_service)

    service, enabled = _prime_evermem_runtime(
        authorization="Bearer jwt-token",
        x_evermem_enabled="false",
        x_evermem_url="https://api.evermind.ai",
        x_evermem_key="secret-key",
    )

    assert enabled is False
    assert service is None
    assert calls == [(False, "https://api.evermind.ai", "secret-key")]


def test_ai_runtime_can_bootstrap_evermem_without_header_key(monkeypatch):
    class DummyService:
        pass

    calls = []

    def fake_resolve_runtime_service(enabled: bool, url: str = None, key: str = None):
        calls.append((enabled, url, key))
        return DummyService()

    monkeypatch.setattr("services.evermem_config.resolve_runtime_service", fake_resolve_runtime_service)

    service, requested, enabled, authed = _prime_ai_evermem_runtime(
        authorization="Bearer jwt-token",
        x_evermem_enabled="true",
        x_evermem_url="https://api.evermind.ai",
        x_evermem_key=None,
    )

    assert requested is True
    assert enabled is True
    assert authed is True
    assert isinstance(service, DummyService)
    assert calls == [(True, "https://api.evermind.ai", None)]


def test_due_count_route_uses_lightweight_summary(monkeypatch):
    temp_dir, db = _build_temp_db()
    try:
        assert db.add_word({"word": "alpha", "meaning": "test"})
        db.execute("UPDATE words SET next_review_time = ? WHERE word = ?", (time.time() - 120, "alpha"))
        monkeypatch.setattr("routers.review.get_db", lambda: db)

        result = asyncio.run(get_due_count())
        assert result == {"due_count": 1}
    finally:
        db.close_connection()
        temp_dir.cleanup()
