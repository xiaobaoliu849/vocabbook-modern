"""Regression tests for ChatRepository.save_session ownership guard.

One machine can hold several accounts, so a sync from account B must never
overwrite (or silently re-key) account A's session. The only ownership change
the guard allows is guest -> cloud, i.e. the same human logging in and claiming
the sessions they created locally while signed out.

Owner keys are built in routers/ai.py:
    guest_<client id>   -- no token, X-Client-Id present
    cloud_<identity>    -- verified token
"""

import os
from tempfile import TemporaryDirectory

from models.database import DatabaseManager


def _build_temp_db():
    temp_dir = TemporaryDirectory()
    db = DatabaseManager(
        db_path=os.path.join(temp_dir.name, "chat.db"),
        json_path=os.path.join(temp_dir.name, "missing.json"),
    )
    return temp_dir, db


def _session(messages, updated_at=20.0):
    return {
        "id": "session-1",
        "title": "Chat",
        "messages": messages,
        "updatedAt": updated_at,
        "createdAt": 10.0,
    }


def _messages(db, owner_key):
    sessions = db.get_all_chat_sessions(owner_key=owner_key)
    assert len(sessions) == 1
    return sessions[0]["messages"]


def _stored_owner(db):
    rows = db.execute(
        "SELECT owner_key FROM chat_sessions WHERE id = ?",
        ("session-1",),
        fetch=True,
        commit=False,
    )
    return rows[0][0]


def test_save_from_another_account_is_skipped():
    temp_dir, db = _build_temp_db()
    try:
        assert db.save_chat_session(_session([{"role": "user", "content": "a"}]), owner_key="guest_a")
        assert _stored_owner(db) == "guest_a"

        # Another account tries to overwrite the same session id.
        assert db.save_chat_session(
            _session([{"role": "user", "content": "hijacked"}]), owner_key="guest_b"
        ) is True

        assert _stored_owner(db) == "guest_a"
        assert _messages(db, "guest_a") == [{"role": "user", "content": "a"}]
        assert db.get_all_chat_sessions(owner_key="guest_b") == []
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_guest_session_is_claimed_by_a_cloud_login():
    temp_dir, db = _build_temp_db()
    try:
        assert db.save_chat_session(_session([{"role": "user", "content": "a"}]), owner_key="guest_abc")

        assert db.save_chat_session(
            _session([{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]),
            owner_key="cloud_alice",
        ) is True

        assert _stored_owner(db) == "cloud_alice"
        assert len(_messages(db, "cloud_alice")) == 2
        assert db.get_all_chat_sessions(owner_key="guest_abc") == []
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_cloud_account_cannot_be_claimed_by_another_cloud_account():
    temp_dir, db = _build_temp_db()
    try:
        assert db.save_chat_session(_session([{"role": "user", "content": "a"}]), owner_key="cloud_alice")

        assert db.save_chat_session(
            _session([{"role": "user", "content": "bob"}]), owner_key="cloud_bob"
        ) is True

        assert _stored_owner(db) == "cloud_alice"
        assert _messages(db, "cloud_alice") == [{"role": "user", "content": "a"}]
        assert db.get_all_chat_sessions(owner_key="cloud_bob") == []
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_cloud_session_cannot_be_downgraded_back_to_guest():
    temp_dir, db = _build_temp_db()
    try:
        assert db.save_chat_session(_session([{"role": "user", "content": "a"}]), owner_key="cloud_alice")

        assert db.save_chat_session(
            _session([{"role": "user", "content": "signed out"}]), owner_key="guest_xyz"
        ) is True

        assert _stored_owner(db) == "cloud_alice"
        assert _messages(db, "cloud_alice") == [{"role": "user", "content": "a"}]
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_session_own_owner_key_field_wins_over_the_header_value():
    """A session dict carrying its own owner_key must not be re-keyed by the caller."""
    temp_dir, db = _build_temp_db()
    try:
        session = _session([{"role": "user", "content": "a"}])
        session["owner_key"] = "cloud_alice"
        assert db.save_chat_session(session, owner_key="guest_b") is True

        # The stored owner is the session's own claim, so the next sync from
        # guest_b is now judged against it and skipped.
        assert _stored_owner(db) == "cloud_alice"

        assert db.save_chat_session(_session([{"role": "user", "content": "b"}]), owner_key="guest_b") is True
        assert _messages(db, "cloud_alice") == [{"role": "user", "content": "a"}]
    finally:
        db.close_all_connections()
        temp_dir.cleanup()
