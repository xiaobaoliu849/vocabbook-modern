"""Regression tests for ReviewsRepository.apply_sm2_review.

The read-compute-write must be a single BEGIN IMMEDIATE transaction. Before
that fix two concurrent submits of the same word both computed SM-2 from the
same snapshot, so the last writer won with stale values (a lost update) while
review_count still incremented twice -- the row looked busy but had only been
rescheduled once.
"""

import os
import threading
from tempfile import TemporaryDirectory

from models.database import DatabaseManager
from services.review_service import ReviewService


def _build_temp_db():
    temp_dir = TemporaryDirectory()
    db = DatabaseManager(
        db_path=os.path.join(temp_dir.name, "review.db"),
        json_path=os.path.join(temp_dir.name, "missing.json"),
    )
    return temp_dir, db


def _add_word(db, word):
    db.execute("INSERT INTO words (word, date_added) VALUES (?, ?)", (word, "2026-01-01"))


def _word_row(db, word):
    rows = db.execute(
        """
        SELECT easiness, interval, repetitions, stage, error_count, review_count, mastered
        FROM words WHERE word = ?
        """,
        (word,),
        fetch=True,
        commit=False,
    )
    return rows[0]


def _expected_after_n_ratings(rating, times):
    """Apply the same rating `times` in a row, mirroring what the repository does."""
    state = {"easiness": 2.5, "interval": 0, "repetitions": 0, "stage": 0}
    for _ in range(times):
        easiness, interval, repetitions = ReviewService.calculate_sm2(rating, state)
        state = {
            "easiness": easiness,
            "interval": interval,
            "repetitions": repetitions,
            "stage": 0,
        }
    return state


def test_apply_sm2_review_persists_recomputed_state_and_history():
    temp_dir, db = _build_temp_db()
    try:
        _add_word(db, "alpha")
        # Still due (next_review_time defaults to 0) and never reviewed, so it is
        # what the post-update due count must be reporting.
        _add_word(db, "beta")

        result = db.reviews.apply_sm2_review("alpha", 4)
        expected = _expected_after_n_ratings(4, 1)

        assert result["easiness"] == expected["easiness"]
        assert result["interval"] == expected["interval"]
        assert result["repetitions"] == expected["repetitions"]
        assert result["mastered"] is False
        # "alpha" was just rescheduled into the future, so only "beta" is due.
        assert result["remaining_due_count"] == 1

        row = _word_row(db, "alpha")
        assert row[0] == expected["easiness"]
        assert row[1] == expected["interval"]
        assert row[2] == expected["repetitions"]
        assert row[5] == 1  # review_count

        history = db.execute(
            "SELECT rating FROM review_history WHERE word_id = (SELECT id FROM words WHERE word = ?)",
            ("alpha",),
            fetch=True,
            commit=False,
        )
        assert history == [(4,)]
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_apply_sm2_review_commits_or_rolls_back_the_transaction():
    """BEGIN IMMEDIATE must never be left open on either path."""
    temp_dir, db = _build_temp_db()
    try:
        _add_word(db, "alpha")
        conn = db.get_connection()

        assert db.reviews.apply_sm2_review("alpha", 4) != {}
        assert conn.in_transaction is False

        assert db.reviews.apply_sm2_review("does-not-exist", 4) == {}
        assert conn.in_transaction is False

        # The connection is still usable: an open transaction would make this
        # raise "cannot start a transaction within a transaction".
        assert db.reviews.apply_sm2_review("alpha", 5) != {}
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_apply_sm2_review_missing_word_leaves_no_trace():
    temp_dir, db = _build_temp_db()
    try:
        assert db.reviews.apply_sm2_review("ghost", 3) == {}
        assert db.execute("SELECT COUNT(*) FROM review_history", fetch=True, commit=False) == [(0,)]
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_apply_sm2_review_low_rating_resets_progress_and_counts_error():
    temp_dir, db = _build_temp_db()
    try:
        _add_word(db, "alpha")
        db.reviews.apply_sm2_review("alpha", 5)
        db.reviews.apply_sm2_review("alpha", 5)
        before = _word_row(db, "alpha")

        result = db.reviews.apply_sm2_review("alpha", 1)

        assert result["repetitions"] == 0
        assert result["interval"] == 1
        assert result["error_count"] == int(before[4] or 0) + 1
    finally:
        db.close_all_connections()
        temp_dir.cleanup()


def test_concurrent_identical_ratings_do_not_lose_updates():
    """N racing submits must land as N sequential applications, not one."""
    temp_dir, db = _build_temp_db()
    threads_count = 6
    try:
        _add_word(db, "alpha")

        errors = []
        barrier = threading.Barrier(threads_count)

        def worker():
            try:
                barrier.wait(timeout=10)
                db.reviews.apply_sm2_review("alpha", 5)
            except Exception as exc:  # noqa: BLE001 - surfaced via `errors`
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(threads_count)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        assert errors == []
        assert not any(thread.is_alive() for thread in threads)

        expected = _expected_after_n_ratings(5, threads_count)
        row = _word_row(db, "alpha")

        assert row[5] == threads_count  # review_count saw every submit
        assert row[1] == expected["interval"]
        assert row[2] == expected["repetitions"]
        assert row[0] == expected["easiness"]

        history = db.execute("SELECT COUNT(*) FROM review_history", fetch=True, commit=False)
        assert history == [(threads_count,)]
    finally:
        db.close_all_connections()
        temp_dir.cleanup()
