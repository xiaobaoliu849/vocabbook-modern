"""
Tests for tag normalization (#8): the `word_tags` table kept in sync with the
legacy comma-separated `words.tags` column.
"""
import sqlite3

from models.database import DatabaseManager


def _make_db(tmp_path):
    db_path = str(tmp_path / "word_tags.db")
    json_path = str(tmp_path / "missing.json")
    return DatabaseManager(db_path=db_path, json_path=json_path)


def _tags_for_word(db, word):
    rows = db.execute(
        "SELECT tag FROM word_tags WHERE word_id = (SELECT id FROM words WHERE word = ?) ORDER BY tag",
        (word,),
        fetch=True,
        commit=False,
    )
    return [row[0] for row in rows]


class TestWordTagsBackfill:
    def test_backfills_legacy_comma_tags(self, tmp_path):
        """A pre-migration DB with comma-separated tags gets word_tags rows on init."""
        db_path = str(tmp_path / "legacy.db")
        json_path = str(tmp_path / "missing.json")

        conn = sqlite3.connect(db_path)
        try:
            # Pre-#8 schema: the real words table WITHOUT the word_tags table
            conn.execute(
                """
                CREATE TABLE words (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word TEXT UNIQUE NOT NULL,
                    phonetic TEXT,
                    meaning TEXT,
                    example TEXT,
                    roots TEXT,
                    synonyms TEXT,
                    context_en TEXT,
                    context_cn TEXT,
                    date_added TEXT,
                    next_review_time REAL DEFAULT 0,
                    review_count INTEGER DEFAULT 0,
                    mastered INTEGER DEFAULT 0,
                    error_count INTEGER DEFAULT 0,
                    stage INTEGER DEFAULT 0,
                    easiness REAL DEFAULT 2.5,
                    interval INTEGER DEFAULT 0,
                    repetitions INTEGER DEFAULT 0,
                    tags TEXT
                )
                """
            )
            conn.execute(
                "INSERT INTO words (word, tags) VALUES ('alpha', ' 考试,高频 '), ('beta', '考试'), ('gamma', '')"
            )
            conn.commit()
        finally:
            conn.close()

        db = DatabaseManager(db_path=db_path, json_path=json_path)
        try:
            rows = db.execute(
                "SELECT word_id, tag FROM word_tags ORDER BY word_id, tag",
                fetch=True,
                commit=False,
            )
            assert rows == [(1, "考试"), (1, "高频"), (2, "考试")]
        finally:
            db.close_connection()

    def test_init_survives_schema_without_tags_column(self, tmp_path):
        """A pre-tags-era DB (no tags column) must init without crashing; the
        column gets added by check_schema_updates before the backfill runs."""
        db_path = str(tmp_path / "ancient.db")
        json_path = str(tmp_path / "missing.json")

        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                """
                CREATE TABLE words (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word TEXT UNIQUE NOT NULL,
                    phonetic TEXT,
                    meaning TEXT,
                    example TEXT,
                    context_en TEXT,
                    context_cn TEXT,
                    date_added TEXT,
                    next_review_time REAL DEFAULT 0,
                    review_count INTEGER DEFAULT 0,
                    mastered INTEGER DEFAULT 0,
                    stage INTEGER DEFAULT 0,
                    easiness REAL DEFAULT 2.5,
                    interval INTEGER DEFAULT 0,
                    repetitions INTEGER DEFAULT 0
                )
                """
            )
            conn.execute("INSERT INTO words (word, meaning) VALUES ('alpha', 'm')")
            conn.commit()
        finally:
            conn.close()

        db = DatabaseManager(db_path=db_path, json_path=json_path)
        try:
            assert db.get_word("alpha")["tags"] == ""
            assert db.get_all_tags() == []
        finally:
            db.close_connection()

    def test_backfill_is_idempotent_across_reopen(self, tmp_path):
        """Re-opening the same DB must not duplicate word_tags rows."""
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "考试,高频"})
            assert len(_tags_for_word(db, "alpha")) == 2

            db.close_connection()
            db2 = DatabaseManager(db_path=db.db_path, json_path=db.json_path)
            try:
                assert len(_tags_for_word(db2, "alpha")) == 2
            finally:
                db2.close_connection()
        finally:
            db.close_connection()


class TestWordTagsWritePaths:
    def test_add_syncs_tags(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "考试, 高频"})
            assert _tags_for_word(db, "alpha") == ["考试", "高频"]
        finally:
            db.close_connection()

    def test_update_replaces_tags(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "考试"})
            db.update_word("alpha", {"tags": "食物"})
            assert _tags_for_word(db, "alpha") == ["食物"]
            # Display column stays in sync too
            assert db.get_word("alpha")["tags"] == "食物"
        finally:
            db.close_connection()

    def test_update_without_tags_leaves_word_tags_untouched(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "考试"})
            db.update_word("alpha", {"meaning": "new meaning"})
            assert _tags_for_word(db, "alpha") == ["考试"]
        finally:
            db.close_connection()

    def test_delete_removes_tags(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "考试"})
            db.delete_word("alpha")
            rows = db.execute("SELECT COUNT(*) FROM word_tags", fetch=True, commit=False)
            assert rows[0][0] == 0
        finally:
            db.close_connection()

    def test_batch_insert_syncs_tags_only_for_new_words(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "existing", "tags": "老标签"})
            inserted = db.add_words_batch([
                {"word": "alpha", "meaning": "dup", "tags": "新标签"},  # exists -> skipped
                {"word": "beta", "meaning": "b", "tags": "考试"},        # new
            ])
            assert inserted == 1
            # Pre-existing word's tags must not be overwritten
            assert _tags_for_word(db, "alpha") == ["老标签"]
            assert _tags_for_word(db, "beta") == ["考试"]
        finally:
            db.close_connection()


class TestWordTagsFiltering:
    def test_search_tag_is_exact_no_like_false_positive(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "smart", "meaning": "m", "tags": "高频"})
            db.add_word({"word": "cart", "meaning": "m", "tags": "考试"})
            db.add_word({"word": "art", "meaning": "m", "tags": "art"})
            # The old LIKE %art% would have matched "smart" and "cart";
            # exact tag matching returns only the word actually tagged "art".
            words, total = db.search_words(tag_filter="art")
            assert total == 1
            assert [w["word"] for w in words] == ["art"]
        finally:
            db.close_connection()

    def test_get_for_list_tag_filter_exact(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "smart", "meaning": "m", "tags": "高频"})
            db.add_word({"word": "art", "meaning": "m", "tags": "考试"})
            result = db.get_words_for_list(tag="考试")
            assert result["total"] == 1
            assert result["words"][0]["word"] == "art"
        finally:
            db.close_connection()

    def test_get_all_tags_from_table(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "高频,考试"})
            db.add_word({"word": "beta", "meaning": "m", "tags": "考试"})
            assert db.get_all_tags() == ["考试", "高频"]
        finally:
            db.close_connection()

    def test_tag_filter_ignored_when_empty(self, tmp_path):
        db = _make_db(tmp_path)
        try:
            db.add_word({"word": "alpha", "meaning": "m", "tags": "考试"})
            db.add_word({"word": "beta", "meaning": "m", "tags": ""})
            words, total = db.search_words()
            assert total == 2
            words, total = db.search_words(tag_filter="")
            assert total == 2
        finally:
            db.close_connection()
