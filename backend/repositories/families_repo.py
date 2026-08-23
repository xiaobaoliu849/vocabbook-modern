from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager

logger = logging.getLogger(__name__)


class FamiliesRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def add(self, root: str, root_meaning: str, word: str) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT OR IGNORE INTO word_families (root, root_meaning, word)
                VALUES (?, ?, ?)
            ''', (root.lower(), root_meaning, word.lower()))
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Add word family error: {e}")
            return False

    def add_batch(self, root: str, root_meaning: str, words: list[str]) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            for word in words:
                cursor.execute('''
                    INSERT OR IGNORE INTO word_families (root, root_meaning, word)
                    VALUES (?, ?, ?)
                ''', (root.lower(), root_meaning, word.lower()))
            conn.commit()
            return True
        except Exception as e:
            # Roll back so the first k-1 inserts don't sit in an open
            # transaction that a later unrelated commit would land.
            conn.rollback()
            logger.error(f"Add word families batch error: {e}")
            return False

    def get_family(self, word: str) -> list[dict]:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT DISTINCT root, root_meaning FROM word_families WHERE word = ?', (word.lower(),))
        roots = cursor.fetchall()

        if not roots:
            return []

        # Single query for all roots instead of N+1 loop
        root_list = [r[0] for r in roots]
        root_meanings = {r[0]: r[1] for r in roots}
        placeholders = ','.join('?' * len(root_list))
        cursor.execute(f'''
            SELECT wf.root, wf.word,
                   CASE WHEN w.word IS NOT NULL THEN 1 ELSE 0 END as in_vocab
            FROM word_families wf
            LEFT JOIN words w ON LOWER(w.word) = wf.word
            WHERE wf.root IN ({placeholders})
            ORDER BY wf.root, wf.word
        ''', root_list)
        all_rows = cursor.fetchall()

        # Group by root in Python
        from itertools import groupby
        from operator import itemgetter

        result = []
        for root_key, group in groupby(all_rows, key=itemgetter(0)):
            family_words = [
                {'word': row[1], 'in_vocab': bool(row[2])}
                for row in group
                if row[1] != word.lower()
            ]
            result.append({
                'root': root_key,
                'root_meaning': root_meanings.get(root_key, ''),
                'words': family_words,
            })

        return result

    def get_roots(self, word: str) -> list[dict]:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT root, root_meaning FROM word_families WHERE word = ?', (word.lower(),))
        rows = cursor.fetchall()
        return [{'root': r[0], 'meaning': r[1]} for r in rows]
