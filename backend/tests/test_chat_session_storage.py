import json
import os
import sqlite3
from tempfile import TemporaryDirectory

from models.database import DatabaseManager


def _build_temp_db():
    temp_dir = TemporaryDirectory()
    db_path = os.path.join(temp_dir.name, "chat.db")
    json_path = os.path.join(temp_dir.name, "missing.json")
    db = DatabaseManager(db_path=db_path, json_path=json_path)
    return temp_dir, db


def test_legacy_chat_sessions_migrate_into_append_storage():
    temp_dir = TemporaryDirectory()
    db_path = os.path.join(temp_dir.name, "legacy.db")
    json_path = os.path.join(temp_dir.name, "missing.json")

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                messages TEXT,
                updated_at REAL,
                created_at REAL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO chat_sessions (id, title, messages, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                "session-1",
                "Legacy session",
                json.dumps(
                    [
                        {"role": "user", "content": "hello"},
                        {"role": "assistant", "content": "hi"},
                    ]
                ),
                20.0,
                10.0,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    db = DatabaseManager(db_path=db_path, json_path=json_path)
    try:
        sessions = db.get_all_chat_sessions(owner_key="guest")
        assert len(sessions) == 1
        assert sessions[0]["messages"] == [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]

        rows = db.execute(
            "SELECT sequence, owner_key FROM chat_messages WHERE session_id = ? ORDER BY sequence ASC",
            ("session-1",),
            fetch=True,
            commit=False,
        )
        assert rows == [(0, "guest"), (1, "guest")]

        session_row = db.execute(
            "SELECT message_count, messages FROM chat_sessions WHERE id = ?",
            ("session-1",),
            fetch=True,
            commit=False,
        )[0]
        assert session_row == (2, "[]")
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_chat_session_save_appends_only_new_messages():
    temp_dir, db = _build_temp_db()
    try:
        session = {
            "id": "session-1",
            "title": "Chat",
            "messages": [{"role": "user", "content": "hello"}],
            "updatedAt": 20.0,
            "createdAt": 10.0,
        }
        assert db.save_chat_session(session, owner_key="guest_a")

        session["messages"].append({"role": "assistant", "content": "hi"})
        session["updatedAt"] = 25.0
        assert db.save_chat_session(session, owner_key="guest_a")

        rows = db.execute(
            "SELECT sequence FROM chat_messages WHERE session_id = ? ORDER BY sequence ASC",
            ("session-1",),
            fetch=True,
            commit=False,
        )
        assert rows == [(0,), (1,)]

        saved = db.get_all_chat_sessions(owner_key="guest_a")
        assert saved[0]["messages"] == session["messages"]
    finally:
        db.close_connection()
        temp_dir.cleanup()


def test_chat_session_save_rewrites_rows_when_history_changes():
    temp_dir, db = _build_temp_db()
    try:
        original = {
            "id": "session-1",
            "title": "Chat",
            "messages": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
            ],
            "updatedAt": 20.0,
            "createdAt": 10.0,
        }
        assert db.save_chat_session(original, owner_key="guest_a")

        rewritten = {
            **original,
            "messages": [{"role": "user", "content": "hello again"}],
            "updatedAt": 30.0,
        }
        assert db.save_chat_session(rewritten, owner_key="guest_a")

        rows = db.execute(
            "SELECT sequence, message_json FROM chat_messages WHERE session_id = ? ORDER BY sequence ASC",
            ("session-1",),
            fetch=True,
            commit=False,
        )
        assert len(rows) == 1
        assert json.loads(rows[0][1]) == {"content": "hello again", "role": "user"}
    finally:
        db.close_connection()
        temp_dir.cleanup()
