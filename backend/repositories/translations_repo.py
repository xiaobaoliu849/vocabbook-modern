from __future__ import annotations

import sqlite3
import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager

logger = logging.getLogger(__name__)


class TranslationsRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def add(self, source_text: str, target_text: str, source_lang: str, target_lang: str) -> int | None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO translations (source_text, target_text, source_lang, target_lang, created_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (source_text, target_text, source_lang, target_lang, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
            conn.commit()
            return cursor.lastrowid
        except Exception as e:
            logger.error(f"Add translation error: {e}")
            return None

    def find(self, source_text: str, source_lang: str, target_lang: str) -> dict | None:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM translations
            WHERE source_text = ? AND source_lang = ? AND target_lang = ?
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT 1
        ''', (source_text, source_lang, target_lang))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_all(self, limit: int = 20, offset: int = 0) -> list[dict]:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT * FROM translations
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def delete(self, translation_id: int) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM translations WHERE id = ?', (translation_id,))
        conn.commit()
        return cursor.rowcount > 0
