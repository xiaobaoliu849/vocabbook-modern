"""Regression tests for the startup migrations in main._run_startup_migrations.

Two one-release-window migrations run inside the lifespan against a database
that predates them:

1. orders.license_days -- added after the first release, and create_all cannot
   ALTER an existing table, so it only appears via an explicit PRAGMA check.
   Without it the member-days snapshot of an order silently vanishes.
2. Legacy mixed-case emails -- the register endpoint lowercases new emails, but
   rows created before that are stored verbatim and can never log in to each
   other's account. The backfill must normalize them *and* step over a pair that
   only differs by case, instead of blowing up on the UNIQUE constraint.
"""

import os
import sqlite3
import sys
import tempfile

from fastapi.testclient import TestClient

CLOUD_SERVER_DIR = os.path.dirname(os.path.dirname(__file__))
_TMP_DIR = tempfile.mkdtemp(prefix="vocabbook-migration-test-")
_DB_PATH = os.path.join(_TMP_DIR, "legacy.db").replace(os.sep, "/")

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"
os.environ["ADMIN_TOKEN"] = "test-admin-token-0000000000000000"

# A database from the previous release: no orders.license_days, mixed-case emails.
_LEGACY_USERS = [
    ("u-normal", "Mixed.Case@Example.COM"),
    ("u-skip", "Conflict@Example.com"),
    ("u-existing", "conflict@example.com"),
]


def _seed_legacy_database():
    conn = sqlite3.connect(_DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                hashed_password TEXT,
                is_active BOOLEAN,
                is_superuser BOOLEAN,
                tier TEXT,
                license_expiry DATETIME,
                created_at DATETIME
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE orders (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                out_trade_no TEXT UNIQUE,
                trade_no TEXT,
                payment_method TEXT,
                amount_fen INTEGER,
                status TEXT,
                description TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
            """
        )
        conn.executemany(
            "INSERT INTO users (id, email, hashed_password, tier) VALUES (?, ?, 'x', 'free')",
            _LEGACY_USERS,
        )
        conn.commit()
    finally:
        conn.close()


_seed_legacy_database()

_MODULES = ("auth", "base", "config", "main", "models", "rate_limit", "routers", "schemas")
_ORIGINAL_MODULES = {name: sys.modules.get(name) for name in _MODULES}
for name in _MODULES:
    sys.modules.pop(name, None)
sys.path.insert(0, CLOUD_SERVER_DIR)

from main import app  # noqa: E402

sys.path.remove(CLOUD_SERVER_DIR)
for name in _MODULES:
    sys.modules.pop(name, None)
    original = _ORIGINAL_MODULES[name]
    if original is not None:
        sys.modules[name] = original


def _query(sql, params=()):
    conn = sqlite3.connect(_DB_PATH)
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def _order_columns():
    return {row[1] for row in _query("PRAGMA table_info(orders)")}


def _emails():
    return {row[0] for row in _query("SELECT email FROM users")}


# Snapshotted at import, i.e. before any TestClient boots the app. Asserting the
# seed through a live helper instead would make the fixture guard below depend on
# running before the other tests in this file.
_PRE_MIGRATION_ORDER_COLUMNS = _order_columns()
_PRE_MIGRATION_EMAILS = _emails()


def _start_app():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200


def test_legacy_database_predates_the_migrations():
    """Guards the fixture: these tests are meaningless if the seed already matches."""
    assert "license_days" not in _PRE_MIGRATION_ORDER_COLUMNS
    assert "Mixed.Case@Example.COM" in _PRE_MIGRATION_EMAILS


def test_startup_adds_the_missing_orders_license_days_column():
    _start_app()

    assert "license_days" in _order_columns()


def test_startup_normalizes_legacy_mixed_case_emails():
    _start_app()

    # Normalized...
    assert "mixed.case@example.com" in _emails()
    # ...and the pre-existing lowercase row is untouched.
    assert "conflict@example.com" in _emails()


def test_case_conflicting_email_is_skipped_without_losing_either_row():
    _start_app()

    emails = _emails()
    # The mixed-case twin could not be normalized without violating UNIQUE, so
    # it keeps its original spelling rather than taking the app down at boot.
    assert "Conflict@Example.com" in emails
    assert "conflict@example.com" in emails
    assert len([email for email in emails if email.lower() == "conflict@example.com"]) == 2
    assert len(emails) == len(_LEGACY_USERS)


def test_startup_migrations_are_idempotent():
    _start_app()
    after_first = _emails()

    _start_app()

    assert _emails() == after_first
    assert "license_days" in _order_columns()
