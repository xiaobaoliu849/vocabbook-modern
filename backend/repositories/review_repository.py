import sqlite3

from models.database import DatabaseManager


class ReviewRepository:
    """Persistence boundary for review and learning-focus data."""

    def __init__(self, db: DatabaseManager):
        self.db = db

    def get_due_words(self, limit: int, include_total: bool = False):
        return self.db.search_words(
            status_filter="due",
            sort_by="next_review_time",
            sort_order="ASC",
            limit=limit,
            offset=0,
            count_total=include_total,
        )

    def get_due_count(self) -> int:
        return self.db.get_due_review_count()

    def get_new_words(self, limit: int):
        return self.db.search_words(
            status_filter="new",
            sort_by="date_added",
            sort_order="DESC",
            limit=limit,
            offset=0,
        )

    def get_difficult_words(self, limit: int) -> list[dict]:
        conn = self.db.get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM words
            WHERE error_count >= 1
            ORDER BY error_count DESC, next_review_time ASC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()

        words: list[dict] = []
        for row in rows:
            word = dict(row)
            word["mastered"] = bool(word["mastered"])
            word["date"] = word["date_added"]
            for key in [
                "phonetic",
                "meaning",
                "example",
                "context_en",
                "context_cn",
                "roots",
                "synonyms",
                "tags",
            ]:
                if word.get(key) is None:
                    word[key] = ""
            words.append(word)
        return words

    def get_word(self, word: str):
        return self.db.get_word(word)

    def update_sm2_status(
        self,
        *,
        word: str,
        easiness: float,
        interval: int,
        repetitions: int,
        next_time: float,
        rating: int,
    ) -> None:
        self.db.update_sm2_status(
            word=word,
            easiness=easiness,
            interval=interval,
            repetitions=repetitions,
            next_time=next_time,
            rating=rating,
        )

    def log_study_session(self, duration: int, review_count: int) -> None:
        self.db.log_study_session(duration, review_count)

    def get_heatmap_data(self):
        return self.db.get_review_heatmap_data()

    def get_word_history(self, word: str):
        word_data = self.db.get_word(word)
        if not word_data:
            return None, None
        return word_data, self.db.get_word_review_history(word_data.get("id"))

    def get_learning_focus_summary(self, limit: int = 5):
        return self.db.get_learning_focus_summary(limit=limit)
