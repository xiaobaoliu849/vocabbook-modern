"""check_schema_updates must fail fast on migration errors.

Previously any ALTER TABLE/migration exception was logged and swallowed, so
the backend booted against a half-migrated database and later queries crashed
far from the root cause. Startup must abort instead.
"""
from unittest.mock import patch

import pytest

from models.database import DatabaseManager
from repositories.chat_repo import ChatRepository


def test_startup_aborts_when_schema_migration_fails(tmp_path):
    with patch.object(
        ChatRepository,
        "ensure_schema",
        side_effect=RuntimeError("simulated migration failure"),
    ):
        with pytest.raises(RuntimeError, match="simulated migration failure"):
            DatabaseManager(
                db_path=str(tmp_path / "vocab.db"),
                json_path=str(tmp_path / "missing.json"),
            )


def test_healthy_database_still_boots(tmp_path):
    db = DatabaseManager(
        db_path=str(tmp_path / "vocab.db"),
        json_path=str(tmp_path / "missing.json"),
    )
    try:
        columns = [
            row[1] for row in db.execute("PRAGMA table_info(words)", fetch=True, commit=False)
        ]
        assert "note" in columns
    finally:
        db.close_all_connections()
