from __future__ import annotations

import json
import sqlite3
import logging
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager

logger = logging.getLogger(__name__)


class ChatRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    @staticmethod
    def _serialize_chat_message(message: Any) -> str:
        return json.dumps(message, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def _deserialize_chat_message(payload: str) -> Any:
        return json.loads(payload)

    def ensure_schema(self, cursor: sqlite3.Cursor) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                owner_key TEXT DEFAULT 'guest',
                sequence INTEGER NOT NULL,
                message_json TEXT NOT NULL,
                created_at REAL,
                UNIQUE(session_id, sequence)
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_sequence "
            "ON chat_messages(session_id, sequence)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_owner_session "
            "ON chat_messages(owner_key, session_id)"
        )

    def migrate_legacy(self, cursor: sqlite3.Cursor) -> None:
        cursor.execute(
            "SELECT id, owner_key, messages, COALESCE(created_at, updated_at, 0) FROM chat_sessions"
        )
        sessions = cursor.fetchall()
        for session_id, owner_key, legacy_messages, created_at in sessions:
            cursor.execute(
                "SELECT COUNT(*) FROM chat_messages WHERE session_id = ?",
                (session_id,),
            )
            message_count = int(cursor.fetchone()[0] or 0)

            parsed_messages: list[Any] = []
            if legacy_messages:
                try:
                    parsed = json.loads(legacy_messages)
                    if isinstance(parsed, list):
                        parsed_messages = parsed
                except json.JSONDecodeError:
                    parsed_messages = []

            if message_count == 0 and parsed_messages:
                for sequence, message in enumerate(parsed_messages):
                    cursor.execute(
                        """
                        INSERT OR REPLACE INTO chat_messages (
                            session_id, owner_key, sequence, message_json, created_at
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            session_id,
                            owner_key or "guest",
                            sequence,
                            self._serialize_chat_message(message),
                            created_at,
                        ),
                    )
                message_count = len(parsed_messages)

            cursor.execute(
                """
                UPDATE chat_sessions
                SET message_count = ?, messages = ?
                WHERE id = ?
                """,
                (message_count, "[]", session_id),
            )

    def save_session(self, session_data: dict, owner_key: str = 'guest') -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        resolved_owner_key = session_data.get('owner_key') or owner_key or 'guest'
        try:
            serialized_messages = [
                self._serialize_chat_message(message)
                for message in session_data.get('messages', [])
            ]
            cursor.execute(
                "SELECT message_json FROM chat_messages WHERE session_id = ? ORDER BY sequence ASC",
                (session_data['id'],),
            )
            existing_messages = [row[0] for row in cursor.fetchall()]

            rewrite_required = (
                len(serialized_messages) < len(existing_messages)
                or serialized_messages[:len(existing_messages)] != existing_messages
            )

            if rewrite_required:
                cursor.execute(
                    "DELETE FROM chat_messages WHERE session_id = ?",
                    (session_data['id'],),
                )
                existing_messages = []
            else:
                cursor.execute(
                    "UPDATE chat_messages SET owner_key = ? WHERE session_id = ?",
                    (resolved_owner_key, session_data['id']),
                )

            start_index = len(existing_messages)
            for sequence, payload in enumerate(serialized_messages[start_index:], start=start_index):
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO chat_messages (
                        session_id, owner_key, sequence, message_json, created_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        session_data['id'],
                        resolved_owner_key,
                        sequence,
                        payload,
                        session_data['createdAt'],
                    ),
                )

            cursor.execute(
                """
                INSERT INTO chat_sessions (id, owner_key, title, messages, message_count, updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    owner_key = excluded.owner_key,
                    title = excluded.title,
                    messages = excluded.messages,
                    message_count = excluded.message_count,
                    updated_at = excluded.updated_at,
                    created_at = excluded.created_at
                """,
                (
                    session_data['id'],
                    resolved_owner_key,
                    session_data['title'],
                    "[]",
                    len(serialized_messages),
                    session_data['updatedAt'],
                    session_data['createdAt'],
                ),
            )
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Save chat session error: {e}")
            return False

    def get_all_sessions(self, owner_key: str | None = None) -> list:
        conn = self.db.get_connection()
        original_row_factory = conn.row_factory
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            if owner_key is None:
                cursor.execute('SELECT * FROM chat_sessions ORDER BY updated_at DESC')
            else:
                cursor.execute('SELECT * FROM chat_sessions WHERE owner_key = ? ORDER BY updated_at DESC', (owner_key,))
            rows = cursor.fetchall()

            session_ids = [row["id"] for row in rows]
            message_map = {session_id: [] for session_id in session_ids}

            if session_ids:
                placeholders = ",".join("?" for _ in session_ids)
                cursor.execute(
                    f"""
                    SELECT session_id, sequence, message_json
                    FROM chat_messages
                    WHERE session_id IN ({placeholders})
                    ORDER BY session_id ASC, sequence ASC
                    """,
                    session_ids,
                )
                for message_row in cursor.fetchall():
                    try:
                        payload = self._deserialize_chat_message(message_row["message_json"])
                    except json.JSONDecodeError:
                        continue
                    message_map.setdefault(message_row["session_id"], []).append(payload)

            result = []
            for row in rows:
                d = dict(row)
                messages = message_map.get(d['id'], [])
                if not messages and d.get('messages'):
                    try:
                        legacy = json.loads(d['messages'])
                        if isinstance(legacy, list):
                            messages = legacy
                    except json.JSONDecodeError:
                        messages = []

                result.append({
                    'id': d['id'],
                    'title': d['title'],
                    'messages': messages,
                    'updatedAt': d['updated_at'],
                    'createdAt': d['created_at'],
                })
            return result
        finally:
            conn.row_factory = original_row_factory

    def delete_session(self, session_id: str, owner_key: str | None = None) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        if owner_key is None:
            cursor.execute('DELETE FROM chat_messages WHERE session_id = ?', (session_id,))
            cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
        else:
            cursor.execute(
                """
                DELETE FROM chat_messages
                WHERE session_id = ?
                  AND session_id IN (
                      SELECT id FROM chat_sessions WHERE id = ? AND owner_key = ?
                  )
                """,
                (session_id, session_id, owner_key),
            )
            cursor.execute('DELETE FROM chat_sessions WHERE id = ? AND owner_key = ?', (session_id, owner_key))
        conn.commit()
        return cursor.rowcount > 0

    def clear_all_sessions(self, owner_key: str | None = None) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        if owner_key is None:
            cursor.execute('DELETE FROM chat_messages')
            cursor.execute('DELETE FROM chat_sessions')
        else:
            cursor.execute(
                'DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE owner_key = ?)',
                (owner_key,),
            )
            cursor.execute('DELETE FROM chat_sessions WHERE owner_key = ?', (owner_key,))
        conn.commit()
        return cursor.rowcount > 0
