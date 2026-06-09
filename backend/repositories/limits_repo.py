from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager


class LimitsRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def reset_if_needed(self, feature: str) -> int:
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT used_count, last_reset_date FROM user_limits WHERE feature = ?', (feature,))
        row = cursor.fetchone()

        if row is None:
            cursor.execute('''
                INSERT INTO user_limits (feature, used_count, last_reset_date)
                VALUES (?, 0, ?)
            ''', (feature, today))
            conn.commit()
            return 0

        used_count, last_reset_date = row
        if last_reset_date != today:
            cursor.execute('''
                UPDATE user_limits
                SET used_count = 0, last_reset_date = ?
                WHERE feature = ?
            ''', (today, feature))
            conn.commit()
            return 0

        return used_count

    def increment(self, feature: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE user_limits
            SET used_count = used_count + 1
            WHERE feature = ?
        ''', (feature,))
        conn.commit()
