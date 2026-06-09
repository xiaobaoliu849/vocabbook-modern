import sqlite3
import json
import os
import time
import threading
from datetime import datetime
from typing import Any, Optional
import logging

from repositories.words_repo import WordsRepository
from repositories.reviews_repo import ReviewsRepository
from repositories.chat_repo import ChatRepository
from repositories.cache_repo import CacheRepository
from repositories.translations_repo import TranslationsRepository
from repositories.families_repo import FamiliesRepository
from repositories.limits_repo import LimitsRepository

logger = logging.getLogger(__name__)


class _DatabaseLocal(threading.local):
    """Typed thread-local state for per-thread SQLite connections."""

    def __init__(self) -> None:
        super().__init__()
        self.connection: Optional[sqlite3.Connection] = None


class DatabaseManager:
    """
    SQLite 数据库管理器，使用线程本地存储的长连接。

    优化策略：
    - 每个线程维护一个独立的数据库连接（线程本地存储）
    - 避免频繁创建/关闭连接的开销
    - 线程安全，支持多线程环境（如词典查询线程）
    """

    def __init__(self, db_path="vocab.db", json_path="vocab.json"):
        self.db_path = db_path
        self.json_path = json_path
        self._local = _DatabaseLocal()
        self._lock = threading.Lock()

        self.words = WordsRepository(self)
        self.reviews = ReviewsRepository(self)
        self.chat = ChatRepository(self)
        self.cache = CacheRepository(self)
        self.translations = TranslationsRepository(self)
        self.families = FamiliesRepository(self)
        self.limits = LimitsRepository(self)

        self.init_db()
        self.check_schema_updates()
        self.migrate_from_json()

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    def get_connection(self):
        """
        获取当前线程的数据库连接。
        每个线程使用独立的连接，避免线程安全问题。
        """
        conn = self._local.connection

        if conn is None:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._local.connection = conn

        return conn

    def close_connection(self):
        """关闭当前线程的数据库连接。"""
        conn = self._local.connection
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            self._local.connection = None

    def execute(self, query, params=(), fetch=False, commit=True):
        """Helper to execute a single query with automatic connection handling."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, params)
            if commit:
                conn.commit()
            if fetch:
                return cursor.fetchall()
            return None
        except sqlite3.Error as e:
            if "database is locked" in str(e) or "disk I/O error" in str(e):
                self.close_connection()
                conn = self.get_connection()
                cursor = conn.cursor()
                cursor.execute(query, params)
                if commit:
                    conn.commit()
                if fetch:
                    return cursor.fetchall()
                return None
            raise

    def execute_many(self, queries):
        """Execute multiple queries in a single transaction."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            for query, params in queries:
                cursor.execute(query, params)
            conn.commit()
        except sqlite3.Error as e:
            conn.rollback()
            raise

    # ------------------------------------------------------------------
    # Schema DDL & migrations
    # ------------------------------------------------------------------

    def init_db(self):
        """Initialize the database tables."""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS words (
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
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS review_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word_id INTEGER,
                review_date TEXT,
                reviewed_at REAL,
                rating INTEGER,
                FOREIGN KEY(word_id) REFERENCES words(id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS word_families (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                root TEXT NOT NULL,
                root_meaning TEXT,
                word TEXT NOT NULL,
                UNIQUE(root, word)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS study_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                total_duration INTEGER DEFAULT 0,
                review_count INTEGER DEFAULT 0
            )
        ''')

        cursor.execute('CREATE INDEX IF NOT EXISTS idx_word ON words(word)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_next_review_time ON words(next_review_time)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_mastered ON words(mastered)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_stage ON words(stage)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_history_word_id ON review_history(word_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_history_review_date ON review_history(review_date)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_word_families_root ON word_families(root)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_word_families_word ON word_families(word)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dict_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL,
                source TEXT NOT NULL,
                data TEXT,
                created_at REAL,
                UNIQUE(word, source)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_dict_cache_word ON dict_cache(word)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_dict_cache_created ON dict_cache(created_at)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS translations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_text TEXT,
                target_text TEXT,
                source_lang TEXT,
                target_lang TEXT,
                created_at TEXT
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_translations_created ON translations(created_at)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                owner_key TEXT DEFAULT 'guest',
                title TEXT,
                messages TEXT,
                message_count INTEGER DEFAULT 0,
                updated_at REAL,
                created_at REAL
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at)')
        cursor.execute("PRAGMA table_info(chat_sessions)")
        chat_columns = [info[1] for info in cursor.fetchall()]
        if 'owner_key' in chat_columns:
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner ON chat_sessions(owner_key)')

        self.chat.ensure_schema(cursor)

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feature TEXT UNIQUE NOT NULL,
                used_count INTEGER DEFAULT 0,
                last_reset_date TEXT
            )
        ''')

        conn.commit()

    def check_schema_updates(self):
        """Check and update database schema for new columns."""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("PRAGMA table_info(words)")
            columns = [info[1] for info in cursor.fetchall()]

            if 'roots' not in columns:
                logger.info("Adding 'roots' column to words table...")
                cursor.execute("ALTER TABLE words ADD COLUMN roots TEXT")

            if 'synonyms' not in columns:
                logger.info("Adding 'synonyms' column to words table...")
                cursor.execute("ALTER TABLE words ADD COLUMN synonyms TEXT")

            if 'tags' not in columns:
                logger.info("Adding 'tags' column to words table...")
                cursor.execute("ALTER TABLE words ADD COLUMN tags TEXT")

            if 'error_count' not in columns:
                logger.error("Adding 'error_count' column to words table...")
                cursor.execute("ALTER TABLE words ADD COLUMN error_count INTEGER DEFAULT 0")

            if 'note' not in columns:
                logger.info("Adding 'note' column to words table...")
                cursor.execute("ALTER TABLE words ADD COLUMN note TEXT")

            cursor.execute("PRAGMA table_info(review_history)")
            review_history_columns = [info[1] for info in cursor.fetchall()]
            if 'reviewed_at' not in review_history_columns:
                logger.info("Adding 'reviewed_at' column to review_history table...")
                cursor.execute("ALTER TABLE review_history ADD COLUMN reviewed_at REAL")
                cursor.execute(
                    """
                    UPDATE review_history
                    SET reviewed_at = CAST(strftime('%s', review_date || ' 00:00:00') AS REAL)
                    WHERE reviewed_at IS NULL AND review_date IS NOT NULL AND review_date != ''
                    """
                )
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_history_word_id ON review_history(word_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_history_review_date ON review_history(review_date)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_review_history_reviewed_at ON review_history(reviewed_at)')

            cursor.execute("PRAGMA table_info(chat_sessions)")
            chat_columns = [info[1] for info in cursor.fetchall()]
            if 'owner_key' not in chat_columns:
                logger.info("Adding 'owner_key' column to chat_sessions table...")
                cursor.execute("ALTER TABLE chat_sessions ADD COLUMN owner_key TEXT DEFAULT 'guest'")
                cursor.execute("UPDATE chat_sessions SET owner_key = 'guest' WHERE owner_key IS NULL OR owner_key = ''")
            if 'message_count' not in chat_columns:
                logger.info("Adding 'message_count' column to chat_sessions table...")
                cursor.execute("ALTER TABLE chat_sessions ADD COLUMN message_count INTEGER DEFAULT 0")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner ON chat_sessions(owner_key)")

            self.chat.ensure_schema(cursor)
            self.chat.migrate_legacy(cursor)

            cursor.execute("SELECT COUNT(*) FROM words WHERE next_review_time = 0 OR next_review_time IS NULL")
            orphan_count = cursor.fetchone()[0]
            if orphan_count > 0:
                logger.warning(f"[Migration] Setting {orphan_count} orphan words (nrt=0) to due-now so they enter the review queue.")
                cursor.execute(
                    "UPDATE words SET next_review_time = ? WHERE next_review_time = 0 OR next_review_time IS NULL",
                    (time.time(),)
                )

            conn.commit()
        except Exception as e:
            logger.error(f"Schema update error: {e}")

    def migrate_from_json(self):
        """Migrate data from vocab.json if DB is empty."""
        if not os.path.exists(self.json_path):
            return

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT count(*) FROM words')
        if cursor.fetchone()[0] > 0:
            return

        logger.info("Migrating data from JSON to SQLite...")
        try:
            with open(self.json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            for item in data:
                try:
                    cursor.execute('''
                        INSERT OR IGNORE INTO words (
                            word, phonetic, meaning, example,
                            context_en, context_cn, date_added,
                            next_review_time, review_count, mastered, stage
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        item.get('word'),
                        item.get('phonetic', ''),
                        item.get('meaning', ''),
                        item.get('example', ''),
                        item.get('context_en', ''),
                        item.get('context_cn', ''),
                        item.get('date', datetime.now().strftime('%Y-%m-%d')),
                        item.get('next_review_time', 0),
                        item.get('review_count', 0),
                        1 if item.get('mastered') else 0,
                        item.get('stage', 0)
                    ))
                except Exception as e:
                    logger.error(f"Skipping error word {item.get('word')}: {e}")

            conn.commit()
            logger.info(f"Migration complete. {len(data)} words imported.")

        except Exception as e:
            logger.error(f"Migration failed: {e}")

    # ------------------------------------------------------------------
    # Backward-compatible delegation methods
    # ------------------------------------------------------------------

    # --- Words ---
    def add_word(self, data): return self.words.add(data)
    def get_word(self, word): return self.words.get(word)
    def get_all_words(self): return self.words.get_all()
    def get_words_for_list(self, keyword=None, tag=None, page=1, page_size=20): return self.words.get_for_list(keyword, tag, page, page_size)
    def get_all_tags(self): return self.words.get_all_tags()
    def update_context(self, word, en, cn): return self.words.update_context(word, en, cn)
    def update_word(self, word, update_data): return self.words.update(word, update_data)
    def delete_word(self, word): return self.words.delete(word)
    def mark_word_mastered(self, word): return self.words.mark_mastered(word)
    def search_words(self, **kwargs): return self.words.search(**kwargs)
    def get_words_count(self): return self.words.get_count()

    # --- Reviews ---
    def update_review_status(self, word, stage, next_time, mastered, review_count_inc=True): return self.reviews.update_review_status(word, stage, next_time, mastered, review_count_inc)
    def update_sm2_status(self, word, easiness, interval, repetitions, next_time, rating): return self.reviews.update_sm2_status(word, easiness, interval, repetitions, next_time, rating)
    def get_review_heatmap_data(self): return self.reviews.get_heatmap_data()
    def get_due_review_count(self): return self.reviews.get_due_count()
    def get_word_review_history(self, word_id): return self.reviews.get_word_history(word_id)
    def get_statistics(self): return self.reviews.get_statistics()
    def get_learning_focus_summary(self, limit=5): return self.reviews.get_learning_focus_summary(limit)
    def log_study_session(self, duration_seconds, review_count=0): return self.reviews.log_study_session(duration_seconds, review_count)
    def get_total_study_time(self): return self.reviews.get_total_study_time()

    # --- Chat ---
    def save_chat_session(self, session_data, owner_key='guest'): return self.chat.save_session(session_data, owner_key)
    def get_all_chat_sessions(self, owner_key=None): return self.chat.get_all_sessions(owner_key)
    def delete_chat_session(self, session_id, owner_key=None): return self.chat.delete_session(session_id, owner_key)
    def clear_all_chat_sessions(self, owner_key=None): return self.chat.clear_all_sessions(owner_key)

    # --- Translations ---
    def add_translation(self, source_text, target_text, source_lang, target_lang): return self.translations.add(source_text, target_text, source_lang, target_lang)
    def find_translation(self, source_text, source_lang, target_lang): return self.translations.find(source_text, source_lang, target_lang)
    def get_translations(self, limit=20, offset=0): return self.translations.get_all(limit, offset)
    def delete_translation(self, translation_id): return self.translations.delete(translation_id)

    # --- Word families ---
    def add_word_family(self, root, root_meaning, word): return self.families.add(root, root_meaning, word)
    def add_word_families_batch(self, root, root_meaning, words): return self.families.add_batch(root, root_meaning, words)
    def get_word_family(self, word): return self.families.get_family(word)
    def get_roots_for_word(self, word): return self.families.get_roots(word)

    # --- Dict cache ---
    def get_dict_cache(self, word, source, ttl=86400): return self.cache.get(word, source, ttl)
    def set_dict_cache(self, word, source, data): return self.cache.set(word, source, data)
    def clear_expired_dict_cache(self, ttl=86400): return self.cache.clear_expired(ttl)
    def get_dict_cache_stats(self): return self.cache.get_stats()
    def clear_all_dict_cache(self): return self.cache.clear_all()
