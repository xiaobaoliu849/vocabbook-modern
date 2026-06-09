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
            logger.error(f"Add word families batch error: {e}")
            return False

    def get_family(self, word: str) -> list[dict]:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT DISTINCT root, root_meaning FROM word_families WHERE word = ?', (word.lower(),))
        roots = cursor.fetchall()

        if not roots:
            return []

        result = []
        for root, root_meaning in roots:
            cursor.execute('''
                SELECT wf.word,
                       CASE WHEN w.word IS NOT NULL THEN 1 ELSE 0 END as in_vocab
                FROM word_families wf
                LEFT JOIN words w ON LOWER(w.word) = wf.word
                WHERE wf.root = ?
                ORDER BY wf.word
            ''', (root,))
            family_words = cursor.fetchall()
            result.append({
                'root': root,
                'root_meaning': root_meaning,
                'words': [{'word': w[0], 'in_vocab': bool(w[1])} for w in family_words if w[0] != word.lower()]
            })

        return result

    def get_roots(self, word: str) -> list[dict]:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT root, root_meaning FROM word_families WHERE word = ?', (word.lower(),))
        rows = cursor.fetchall()
        return [{'root': r[0], 'meaning': r[1]} for r in rows]
