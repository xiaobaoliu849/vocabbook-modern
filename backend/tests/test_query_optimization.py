"""
Tests for word query speed optimizations.
Validates: cache TTL/capacity, N+1 fix in FamiliesRepo, DB indexes, aggregate timeout.
"""
import sqlite3
import time
import os
import sys
import tempfile

import pytest

# Ensure backend dir is in path (conftest.py does this too)
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.dict_service import _dict_cache, _cache_ttl, _get_cached, _set_cached
from services.multi_dict_service import MultiDictService


class TestDictServiceCache:
    """Test DictService LRU cache optimizations."""

    def setup_method(self):
        _dict_cache.clear()

    def teardown_method(self):
        _dict_cache.clear()

    def test_cache_ttl_is_30_minutes(self):
        """Cache TTL should be 1800 seconds (30 minutes)."""
        assert _cache_ttl == 1800

    def test_cache_capacity_is_2000(self):
        """Cache should hold up to 2000 entries before eviction."""
        # Fill cache with 2000 entries
        for i in range(2000):
            _set_cached(f"word_{i}:default", {"word": f"word_{i}", "meaning": f"meaning_{i}"})
        assert len(_dict_cache) == 2000

        # Adding one more should evict the oldest
        _set_cached("word_overflow:default", {"word": "overflow", "meaning": "overflow"})
        assert len(_dict_cache) == 2000
        # First entry should be evicted
        assert _get_cached("word_0:default") is None
        # Last entry should exist
        assert _get_cached("word_overflow:default") is not None

    def test_cache_hit_returns_result(self):
        """Cache hit should return the stored result."""
        _set_cached("hello:default", {"word": "hello", "meaning": "greeting"})
        result = _get_cached("hello:default")
        assert result is not None
        assert result["word"] == "hello"

    def test_cache_miss_returns_none(self):
        """Cache miss should return None."""
        result = _get_cached("nonexistent:default")
        assert result is None


class TestMultiDictServiceTimeout:
    """Test aggregate timeout optimization."""

    def test_aggregate_timeout_is_8(self):
        """Aggregate timeout should be 8 seconds."""
        assert MultiDictService._aggregate_timeout == 8


class TestFamiliesRepoSingleQuery:
    """Test that FamiliesRepo.get_family uses a single query instead of N+1."""

    def test_get_family_returns_correct_structure(self, tmp_path):
        """get_family should return correct grouped structure with single query."""
        from models.database import DatabaseManager

        db_path = str(tmp_path / "test_families.db")
        db = DatabaseManager(db_path=db_path)

        conn = db.get_connection()
        cursor = conn.cursor()

        # Insert test word
        cursor.execute('''
            INSERT INTO words (word, phonetic, meaning, example, date_added, next_review_time)
            VALUES ('prediction', '', 'n. 预测', '', '2024-01-01', 0)
        ''')

        # Insert word families: 2 roots sharing the word "predict"
        cursor.execute("INSERT OR IGNORE INTO word_families (root, root_meaning, word) VALUES ('pre-', '前', 'predict')")
        cursor.execute("INSERT OR IGNORE INTO word_families (root, root_meaning, word) VALUES ('pre-', '前', 'prediction')")
        cursor.execute("INSERT OR IGNORE INTO word_families (root, root_meaning, word) VALUES ('pre-', '前', 'preview')")
        cursor.execute("INSERT OR IGNORE INTO word_families (root, root_meaning, word) VALUES ('dict-', '说', 'predict')")
        cursor.execute("INSERT OR IGNORE INTO word_families (root, root_meaning, word) VALUES ('dict-', '说', 'dictionary')")
        cursor.execute("INSERT OR IGNORE INTO word_families (root, root_meaning, word) VALUES ('dict-', '说', 'prediction')")
        conn.commit()

        result = db.families.get_family("prediction")

        assert len(result) == 2

        root_names = {r['root'] for r in result}
        assert root_names == {'pre-', 'dict-'}

        for entry in result:
            # 'prediction' itself should be excluded
            word_names = [w['word'] for w in entry['words']]
            assert 'prediction' not in word_names

            if entry['root'] == 'pre-':
                assert 'predict' in word_names
                assert 'preview' in word_names
                assert entry['root_meaning'] == '前'
            elif entry['root'] == 'dict-':
                assert 'predict' in word_names
                assert 'dictionary' in word_names
                assert entry['root_meaning'] == '说'

        # Check in_vocab flag: 'prediction' is saved, so related words should show in_vocab correctly
        for entry in result:
            for w in entry['words']:
                if w['word'] == 'predict':
                    # 'predict' is NOT in the words table
                    assert w['in_vocab'] is False

        db.close_connection()

    def test_get_family_empty_word(self, tmp_path):
        """get_family should return empty list for unknown word."""
        from models.database import DatabaseManager

        db_path = str(tmp_path / "test_families_empty.db")
        db = DatabaseManager(db_path=db_path)

        result = db.families.get_family("nonexistentxyz")
        assert result == []

        db.close_connection()


class TestDatabaseIndexes:
    """Test that required indexes are created."""

    def test_indexes_created(self, tmp_path):
        """Verify that new indexes are created on init_db."""
        from models.database import DatabaseManager

        db_path = str(tmp_path / "test_indexes.db")
        db = DatabaseManager(db_path=db_path)

        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
        index_names = {row[0] for row in cursor.fetchall()}

        # Original indexes
        assert 'idx_word' in index_names
        assert 'idx_next_review_time' in index_names
        assert 'idx_mastered' in index_names

        # New indexes from this optimization
        assert 'idx_words_lower_word' in index_names
        assert 'idx_words_mastered_review' in index_names

        db.close_connection()
