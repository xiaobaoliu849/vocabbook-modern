from __future__ import annotations

import sqlite3
import time
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager


class WordsRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def add(self, data: dict) -> bool:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO words (word, phonetic, meaning, example, context_en, context_cn, roots, synonyms, tags, date_added, next_review_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                data.get('date', datetime.now().strftime('%Y-%m-%d')),
                time.time()
            ))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
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
            for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags', 'note']:
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
            for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags', 'note']:
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
            where_clauses.append("tags LIKE ?")
            params.append(f"%{tag}%")

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

    def get_all_tags(self) -> list[str]:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT DISTINCT tags FROM words WHERE tags IS NOT NULL AND tags != ""')
        rows = cursor.fetchall()
        tags_set = set()
        for row in rows:
            if row[0]:
                for tag in row[0].split(','):
                    tag = tag.strip()
                    if tag:
                        tags_set.add(tag)
        return sorted(list(tags_set))

    def update_context(self, word: str, en: str, cn: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE words SET context_en = ?, context_cn = ? WHERE word = ?', (en, cn, word))
        conn.commit()

    def update(self, word: str, update_data: dict) -> bool:
        if not update_data:
            return False

        conn = self.db.get_connection()
        cursor = conn.cursor()

        valid_columns = {
            'phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'note',
            'roots', 'synonyms', 'tags', 'mastered', 'stage'
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
            conn.commit()
            return cursor.rowcount > 0
        except sqlite3.Error:
            return False

    def delete(self, word: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM words WHERE word = ?', (word,))
        conn.commit()

    def mark_mastered(self, word: str) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE words SET mastered = 1 WHERE word = ?', (word,))
        conn.commit()

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
            conditions.append("tags LIKE ?")
            params.append(f"%{tag_filter}%")

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
            for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags', 'note']:
                if d.get(key) is None:
                    d[key] = ""
            result.append(d)

        return result, total_count

    def get_count(self) -> int:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM words')
        return cursor.fetchone()[0]
