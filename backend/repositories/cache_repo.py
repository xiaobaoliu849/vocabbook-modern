from __future__ import annotations

import json
import time
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager

logger = logging.getLogger(__name__)


class CacheRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def get(self, word: str, source: str, ttl: int = 86400) -> dict | None:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        now = time.time()
        cursor.execute('''
            SELECT data, created_at FROM dict_cache
            WHERE word = ? AND source = ?
        ''', (word.lower(), source))

        row = cursor.fetchone()
        if row:
            data_json, created_at = row
            if now - created_at < ttl:
                try:
                    return json.loads(data_json)
                except (json.JSONDecodeError, TypeError):
                    return None
            else:
                cursor.execute('DELETE FROM dict_cache WHERE word = ? AND source = ?',
                              (word.lower(), source))
                conn.commit()
        return None

    def set(self, word: str, source: str, data: dict) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            data_json = json.dumps(data, ensure_ascii=False)
            cursor.execute('''
                INSERT OR REPLACE INTO dict_cache (word, source, data, created_at)
                VALUES (?, ?, ?, ?)
            ''', (word.lower(), source, data_json, time.time()))
            conn.commit()
        except Exception as e:
            logger.error(f"Set dict cache error: {e}")

    def clear_expired(self, ttl: int = 86400) -> int:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        expired_time = time.time() - ttl
        cursor.execute('DELETE FROM dict_cache WHERE created_at < ?', (expired_time,))
        deleted = cursor.rowcount
        conn.commit()
        return deleted

    def get_stats(self) -> dict:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT COUNT(*) FROM dict_cache')
        total = cursor.fetchone()[0]

        cursor.execute('SELECT source, COUNT(*) FROM dict_cache GROUP BY source')
        by_source = {row[0]: row[1] for row in cursor.fetchall()}

        return {'total': total, 'by_source': by_source}

    def clear_all(self) -> int:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM dict_cache')
        deleted = cursor.rowcount
        conn.commit()
        return deleted
