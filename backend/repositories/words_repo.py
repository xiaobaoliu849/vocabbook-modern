from __future__ import annotations

import sqlite3
import time
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager


def _split_tags(tags_str: str) -> list[str]:
    """Parse a comma-separated tag string into stripped, non-empty tags."""
    if not tags_str:
        return []
    return [t.strip() for t in tags_str.split(',') if t.strip()]


def _sync_word_tags(cursor: sqlite3.Cursor, word_id: int, tags_str: str) -> None:
    """Replace the word's word_tags rows to match the comma-separated string.

    Keeps the structured index in sync with `words.tags`. Must run in the same
    transaction as the words-table write.
    """
    cursor.execute('DELETE FROM word_tags WHERE word_id = ?', (word_id,))
    for tag in _split_tags(tags_str):
        cursor.execute(
            'INSERT OR IGNORE INTO word_tags (word_id, tag) VALUES (?, ?)',
            (word_id, tag),
        )


class WordsRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def add(self, data: dict) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO words (word, phonetic, meaning, example, context_en, context_cn, roots, synonyms, tags, audio, date_added, next_review_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data['word'],
                data.get('phonetic', ''),
                data.get('meaning', ''),
                data.get('example', ''),
                data.get('context_en', ''),
                data.get('context_cn', ''),
                data.get('roots', ''),
                data.get('synonyms', ''),
                data.get('tags', ''),
                data.get('audio', ''),
                data.get('date', datetime.now().strftime('%Y-%m-%d')),
                time.time()
            ))
            _sync_word_tags(cursor, cursor.lastrowid, data.get('tags', ''))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            # Roll back so the thread-local connection doesn't carry a half
            # -finished transaction into the next caller's commit.
            conn.rollback()
            return False

    def get(self, word: str) -> dict | None:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM words WHERE word = ?', (word,))
        row = cursor.fetchone()
        if row:
            d = dict(row)
            d['mastered'] = bool(d['mastered'])
            d['date'] = d['date_added']
            for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags', 'note', 'audio']:
                if d.get(key) is None:
                    d[key] = ""
            return d
        return None

    def get_all(self) -> list[dict]:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM words ORDER BY next_review_time ASC')
        rows = cursor.fetchall()

        result = []
        for row in rows:
            d = dict(row)
            d['mastered'] = bool(d['mastered'])
            d['date'] = d['date_added']
            for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags', 'note', 'audio']:
                if d.get(key) is None:
                    d[key] = ""
            result.append(d)
        return result

    def get_for_list(self, keyword=None, tag=None, page=1, page_size=20) -> dict:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        select_fields = '''
            id, word, phonetic, meaning, mastered, next_review_time,
            tags, date_added, review_count
        '''

        where_clauses = []
        params = []

        if keyword:
            where_clauses.append("(word LIKE ? OR meaning LIKE ?)")
            params.extend([f"%{keyword}%", f"%{keyword}%"])

        if tag:
            where_clauses.append("EXISTS (SELECT 1 FROM word_tags wt WHERE wt.word_id = words.id AND wt.tag = ?)")
            params.append(tag)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        count_sql = f"SELECT COUNT(*) FROM words WHERE {where_sql}"
        cursor.execute(count_sql, tuple(params))
        total = cursor.fetchone()[0]

        offset = (page - 1) * page_size
        data_sql = f'''
            SELECT {select_fields}
            FROM words
            WHERE {where_sql}
            ORDER BY next_review_time ASC
            LIMIT ? OFFSET ?
        '''
        cursor.execute(data_sql, tuple(params) + (page_size, offset))
        rows = cursor.fetchall()

        result = []
        for row in rows:
            d = dict(row)
            d['mastered'] = bool(d.get('mastered', 0))
            d['date'] = d.get('date_added', '')
            for key in ['phonetic', 'meaning', 'tags']:
                if d.get(key) is None:
                    d[key] = ""
            result.append(d)

        return {'words': result, 'total': total}

    def get_existing_words(self, words: list[str]) -> list[str]:
        """Return which of the given words already exist (case-sensitive, like get()).

        Chunks the IN list to stay under SQLite's variable limit.
        """
        if not words:
            return []
        conn = self.db.get_connection()
        cursor = conn.cursor()
        found: list[str] = []
        for start in range(0, len(words), 500):
            chunk = words[start:start + 500]
            placeholders = ",".join("?" * len(chunk))
            cursor.execute(f"SELECT word FROM words WHERE word IN ({placeholders})", chunk)
            found.extend(row[0] for row in cursor.fetchall())
        return found

    def add_words_batch(self, words_data: list[dict]) -> int:
        """Insert many words in a single transaction; returns the number actually inserted.

        word_tags rows are synced only for words that are actually new, so the
        tags of pre-existing words are never overwritten.
        """
        if not words_data:
            return 0
        conn = self.db.get_connection()
        cursor = conn.cursor()
        now = datetime.now().strftime('%Y-%m-%d')
        params = [
            (
                d['word'],
                d.get('phonetic', ''),
                d.get('meaning', ''),
                d.get('example', ''),
                d.get('context_en', ''),
                d.get('context_cn', ''),
                d.get('roots', ''),
                d.get('synonyms', ''),
                d.get('tags', ''),
                d.get('audio', ''),
                d.get('date', now),
                time.time(),
            )
            for d in words_data
        ]
        try:
            # Existing words are skipped by INSERT OR IGNORE; only sync tags for new ones.
            existing_words = set(self.get_existing_words([d['word'] for d in words_data]))
            words_before = conn.total_changes
            cursor.executemany(
                '''
                INSERT OR IGNORE INTO words (
                    word, phonetic, meaning, example, context_en, context_cn,
                    roots, synonyms, tags, audio, date_added, next_review_time
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                params,
            )
            inserted = conn.total_changes - words_before
            new_words = [d for d in words_data if d['word'] not in existing_words]
            if new_words:
                id_map = self._word_ids_by_word(cursor, [d['word'] for d in new_words])
                tag_rows = [
                    (id_map[d['word']], tag)
                    for d in new_words
                    if d['word'] in id_map
                    for tag in _split_tags(d.get('tags', ''))
                ]
                if tag_rows:
                    cursor.executemany(
                        'INSERT OR IGNORE INTO word_tags (word_id, tag) VALUES (?, ?)',
                        tag_rows,
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        return inserted

    @staticmethod
    def _word_ids_by_word(cursor: sqlite3.Cursor, words: list[str]) -> dict[str, int]:
        """Map words to their ids using chunked IN queries."""
        result: dict[str, int] = {}
        for start in range(0, len(words), 500):
            chunk = words[start:start + 500]
            placeholders = ",".join("?" * len(chunk))
            cursor.execute(f"SELECT id, word FROM words WHERE word IN ({placeholders})", chunk)
            for row in cursor.fetchall():
                result[row[1]] = row[0]
        return result

    def get_all_tags(self) -> list[str]:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT DISTINCT tag FROM word_tags ORDER BY tag')
        tags = [row[0] for row in cursor.fetchall()]
        if not tags:
            # Defensive fallback: legacy scan in case the one-time backfill
            # never ran for this database.
            cursor.execute('SELECT DISTINCT tags FROM words WHERE tags IS NOT NULL AND tags != ""')
            tags_set = set()
            for row in cursor.fetchall():
                if row[0]:
                    for tag in row[0].split(','):
                        tag = tag.strip()
                        if tag:
                            tags_set.add(tag)
            return sorted(tags_set)
        return tags

    def update_context(self, word: str, en: str, cn: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('UPDATE words SET context_en = ?, context_cn = ? WHERE word = ?', (en, cn, word))
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def update(self, word: str, update_data: dict) -> bool:
        if not update_data:
            return False

        conn = self.db.get_connection()
        cursor = conn.cursor()

        valid_columns = {
            'phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'note',
            'roots', 'synonyms', 'tags', 'audio', 'mastered', 'stage'
        }

        set_clauses = []
        params = []
        for col, val in update_data.items():
            if col in valid_columns:
                set_clauses.append(f"{col} = ?")
                params.append(val)

        if not set_clauses:
            return False

        sql = f"UPDATE words SET {', '.join(set_clauses)} WHERE word = ?"
        params.append(word)

        try:
            cursor.execute(sql, tuple(params))
            affected = cursor.rowcount
            if 'tags' in update_data:
                cursor.execute('SELECT id FROM words WHERE word = ?', (word,))
                row = cursor.fetchone()
                if row:
                    _sync_word_tags(cursor, row[0], update_data['tags'] or '')
            conn.commit()
            return affected > 0
        except sqlite3.Error:
            # Roll back so the thread-local connection doesn't carry a half
            # -finished transaction into the next caller's commit.
            conn.rollback()
            return False

    def delete(self, word: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
    def delete(self, word: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('DELETE FROM word_tags WHERE word_id = (SELECT id FROM words WHERE word = ?)', (word,))
            cursor.execute('DELETE FROM words WHERE word = ?', (word,))
            conn.commit()
        except Exception:
            # Roll back the partial delete (word_tags gone but words row kept)
            # so the thread-local connection isn't left dirty.
            conn.rollback()
            raise

    def mark_mastered(self, word: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('UPDATE words SET mastered = 1 WHERE word = ?', (word,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def search(
        self,
        keyword="",
        tag_filter="",
        mastered_filter=None,
        status_filter=None,
        sort_by="next_review_time",
        sort_order="ASC",
        limit=50,
        offset=0,
        count_total=True,
    ) -> tuple[list[dict], int | None]:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        conditions = []
        params = []

        if keyword:
            conditions.append("(word LIKE ? OR meaning LIKE ?)")
            like_pattern = f"%{keyword}%"
            params.extend([like_pattern, like_pattern])

        if tag_filter:
            conditions.append("EXISTS (SELECT 1 FROM word_tags wt WHERE wt.word_id = words.id AND wt.tag = ?)")
            params.append(tag_filter)

        if mastered_filter is not None:
            conditions.append("mastered = ?")
            params.append(1 if mastered_filter else 0)

        if status_filter:
            now_ts = time.time()
            if status_filter == "due":
                conditions.append("(next_review_time = 0 OR (next_review_time > 0 AND next_review_time <= ?))")
                params.append(now_ts)
            elif status_filter == "new":
                conditions.append("next_review_time = 0")
            elif status_filter == "learning":
                conditions.append("mastered = 0 AND next_review_time > ?")
                params.append(now_ts)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        valid_sort_fields = {"word", "next_review_time", "date_added", "review_count", "mastered", "easiness", "interval"}
        if sort_by not in valid_sort_fields:
            sort_by = "next_review_time"
        if sort_order.upper() not in ("ASC", "DESC"):
            sort_order = "ASC"

        total_count = None
        if count_total:
            count_sql = f"SELECT COUNT(*) FROM words WHERE {where_clause}"
            cursor.execute(count_sql, params)
            total_count = cursor.fetchone()[0]

        query_sql = f"""
            SELECT * FROM words
            WHERE {where_clause}
            ORDER BY {sort_by} {sort_order}
            LIMIT ? OFFSET ?
        """
        cursor.execute(query_sql, params + [limit, offset])
        rows = cursor.fetchall()

        result = []
        for row in rows:
            d = dict(row)
            d['mastered'] = bool(d['mastered'])
            d['date'] = d['date_added']
            for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags', 'note', 'audio']:
                if d.get(key) is None:
                    d[key] = ""
            result.append(d)

        return result, total_count

    def get_count(self) -> int:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM words')
        return cursor.fetchone()[0]
