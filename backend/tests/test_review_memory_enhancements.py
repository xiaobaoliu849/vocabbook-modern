import asyncio
import json
import os
import time
from tempfile import TemporaryDirectory

import pytest

from models.database import DatabaseManager
from routers.ai import _resolve_chat_owner_key, _can_use_evermem as _ai_can_use_evermem
from routers.review import _resolve_evermem_user_id, _can_use_evermem as _review_can_use_evermem
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


def test_low_quality_uses_hour_level_retry_windows():
    now_ts = time.time()

    in_1_hours = (ReviewService.calculate_next_review_time(interval=1, quality=1) - now_ts) / 3600
    in_2_hours = (ReviewService.calculate_next_review_time(interval=1, quality=2) - now_ts) / 3600
    in_3_hours = (ReviewService.calculate_next_review_time(interval=1, quality=3) - now_ts) / 3600

    assert 7.5 <= in_1_hours <= 8.5
    assert 19.5 <= in_2_hours <= 20.5
    assert 23.0 <= in_3_hours <= 25.0


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
