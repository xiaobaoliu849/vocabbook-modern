from __future__ import annotations

import time
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, TYPE_CHECKING

if TYPE_CHECKING:
    from models.database import DatabaseManager

logger = logging.getLogger(__name__)


class ReviewsRepository:

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def update_review_status(self, word: str, stage: int, next_time: float, mastered: bool, review_count_inc: bool = True) -> None:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        sql = '''
            UPDATE words
            SET stage = ?, next_review_time = ?, mastered = ?
        '''
        params: list = [stage, next_time, 1 if mastered else 0]

        if review_count_inc:
            sql += ', review_count = review_count + 1'

        sql += ' WHERE word = ?'
        params.append(word)

        cursor.execute(sql, tuple(params))

        today = datetime.now().strftime('%Y-%m-%d')
        reviewed_at = time.time()
        cursor.execute('SELECT id FROM words WHERE word = ?', (word,))
        res = cursor.fetchone()
        if res:
            wid = res[0]
            cursor.execute(
                'INSERT INTO review_history (word_id, review_date, reviewed_at, rating) VALUES (?, ?, ?, ?)',
                (wid, today, reviewed_at, 1),
            )

        conn.commit()

    def update_sm2_status(self, word: str, easiness: float, interval: int, repetitions: int, next_time: float, rating: int) -> None:
        mastered = 1 if interval > 180 else 0
        error_delta = 1 if rating <= 2 else (-1 if rating >= 4 else 0)
        reviewed_at = time.time()
        today = datetime.fromtimestamp(reviewed_at).strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                '''
                UPDATE words
                SET easiness = ?, interval = ?, repetitions = ?, next_review_time = ?,
                    mastered = ?, review_count = review_count + 1,
                    error_count = MAX(0, error_count + ?)
                WHERE word = ?
                ''',
                (easiness, interval, repetitions, next_time, mastered, error_delta, word),
            )

            cursor.execute('SELECT id FROM words WHERE word = ?', (word,))
            res = cursor.fetchone()
            if res:
                cursor.execute(
                    '''
                    INSERT INTO review_history (word_id, review_date, reviewed_at, rating)
                    VALUES (?, ?, ?, ?)
                    ''',
                    (res[0], today, reviewed_at, rating),
                )

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def get_heatmap_data(self) -> dict:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        one_year_ago = (datetime.now() - timedelta(days=366)).strftime('%Y-%m-%d')
        cursor.execute('''
            SELECT review_date, COUNT(*)
            FROM review_history
            WHERE review_date >= ?
            GROUP BY review_date
        ''', (one_year_ago,))
        rows = cursor.fetchall()
        return {row[0]: row[1] for row in rows}

    def get_due_count(self) -> int:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        now_ts = time.time()
        cursor.execute(
            'SELECT COUNT(*) FROM words WHERE next_review_time = 0 OR (next_review_time > 0 AND next_review_time <= ?)',
            (now_ts,),
        )
        row = cursor.fetchone()
        return int(row[0] or 0) if row else 0

    def get_word_history(self, word_id: int) -> list:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            '''
            SELECT review_date, rating, reviewed_at
            FROM review_history
            WHERE word_id = ?
            ORDER BY COALESCE(reviewed_at, CAST(strftime('%s', review_date || ' 00:00:00') AS REAL)) ASC, id ASC
            ''',
            (word_id,),
        )
        return cursor.fetchall()

    def get_statistics(self) -> dict:
        conn = self.db.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT COUNT(*) FROM words')
        total = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM words WHERE mastered = 1')
        mastered = cursor.fetchone()[0]

        now_ts = time.time()
        cursor.execute(
            'SELECT COUNT(*) FROM words WHERE next_review_time = 0 OR (next_review_time > 0 AND next_review_time <= ?)',
            (now_ts,)
        )
        due_today = cursor.fetchone()[0]

        cursor.execute('SELECT COUNT(*) FROM words WHERE review_count = 0 AND mastered = 0')
        new_words = cursor.fetchone()[0]

        learning = total - mastered - new_words

        today_str = datetime.now().strftime('%Y-%m-%d')

        cursor.execute('SELECT COUNT(DISTINCT word_id) FROM review_history WHERE review_date = ?', (today_str,))
        reviewed_today = cursor.fetchone()[0]

        cursor.execute('SELECT DISTINCT review_date FROM review_history ORDER BY review_date DESC')
        dates = [row[0] for row in cursor.fetchall()]

        streak_days = 0
        if dates:
            latest_date = datetime.strptime(dates[0], '%Y-%m-%d').date()
            today_date = datetime.now().date()

            if latest_date == today_date or latest_date == (today_date - timedelta(days=1)):
                streak_days = 1
                current_check = latest_date

                for i in range(1, len(dates)):
                    prev_date = datetime.strptime(dates[i], '%Y-%m-%d').date()
                    if (current_check - prev_date).days == 1:
                        streak_days += 1
                        current_check = prev_date
                    else:
                        break
            else:
                streak_days = 0

        return {
            'total': total,
            'mastered': mastered,
            'learning': learning,
            'new': new_words,
            'due_today': due_today,
            'reviewed_today': reviewed_today,
            'streak_days': streak_days
        }

    def get_learning_focus_summary(self, limit: int = 5) -> Dict[str, Any]:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        now_ts = time.time()

        cursor.execute(
            '''
            SELECT
                word,
                meaning,
                error_count,
                easiness,
                repetitions,
                next_review_time,
                review_count
            FROM words
            WHERE review_count > 0
              AND (
                    error_count > 0
                    OR easiness < 2.2
                    OR (next_review_time > 0 AND next_review_time <= ?)
                  )
            ORDER BY
                CASE WHEN error_count > 0 THEN 0 ELSE 1 END ASC,
                error_count DESC,
                easiness ASC,
                CASE WHEN next_review_time > 0 AND next_review_time <= ? THEN 0 ELSE 1 END ASC,
                next_review_time ASC,
                review_count DESC
            LIMIT ?
            ''',
            (now_ts, now_ts, limit),
        )

        rows = cursor.fetchall()
        weak_words: List[Dict[str, Any]] = []
        for row in rows:
            word, meaning, error_count, easiness, repetitions, next_review_time, review_count = row
            weak_words.append({
                "word": word,
                "meaning": meaning or "",
                "error_count": int(error_count or 0),
                "easiness": float(easiness or 2.5),
                "repetitions": int(repetitions or 0),
                "next_review_time": float(next_review_time or 0),
                "review_count": int(review_count or 0),
                "is_due": bool(next_review_time and next_review_time <= now_ts),
            })

        cursor.execute(
            'SELECT COUNT(*) FROM words WHERE next_review_time > 0 AND next_review_time <= ?',
            (now_ts,),
        )
        due_count = int(cursor.fetchone()[0] or 0)

        cursor.execute(
            'SELECT COUNT(*) FROM words WHERE error_count > 0'
        )
        difficult_count = int(cursor.fetchone()[0] or 0)

        return {
            "weak_words": weak_words,
            "due_count": due_count,
            "difficult_count": difficult_count,
        }

    def log_study_session(self, duration_seconds: int, review_count: int = 0) -> None:
        if duration_seconds <= 0:
            return

        today = datetime.now().strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
                UPDATE study_stats
                SET total_duration = total_duration + ?, review_count = review_count + ?
                WHERE date = ?
            ''', (duration_seconds, review_count, today))

            if cursor.rowcount == 0:
                cursor.execute('''
                    INSERT INTO study_stats (date, total_duration, review_count)
                    VALUES (?, ?, ?)
                ''', (today, duration_seconds, review_count))

            conn.commit()
        except Exception as e:
            logger.error(f"Log study session error: {e}")

    def get_total_study_time(self) -> int:
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(total_duration) FROM study_stats")
        res = cursor.fetchone()
        return res[0] if res and res[0] else 0
