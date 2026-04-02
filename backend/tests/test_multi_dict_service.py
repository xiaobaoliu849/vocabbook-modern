import time

import config
from services import multi_dict_service
from services.multi_dict_service import MultiDictService


def test_get_db_manager_supports_current_import_mode(monkeypatch, tmp_path):
    original_db = multi_dict_service._db_manager
    test_db_path = tmp_path / "dict-cache.db"

    monkeypatch.setattr(config, "DB_PATH", str(test_db_path))
    multi_dict_service._db_manager = None

    try:
        db = multi_dict_service.get_db_manager()
        assert db is not None
        assert str(db.db_path) == str(test_db_path)
    finally:
        if multi_dict_service._db_manager is not None:
            multi_dict_service._db_manager.close_connection()
        multi_dict_service._db_manager = original_db


def test_aggregate_search_returns_partial_results_on_timeout(monkeypatch):
    original_timeout = MultiDictService._aggregate_timeout

    def fast_cambridge(_word):
        return {
            "source": MultiDictService.DICT_CAMBRIDGE,
            "source_name": MultiDictService.DICT_NAMES[MultiDictService.DICT_CAMBRIDGE],
            "word": "snag",
            "phonetic": "US test",
            "meaning": "fast result",
            "example": "",
        }

    def slow_bing(_word):
        time.sleep(0.2)
        return {
            "source": MultiDictService.DICT_BING,
            "source_name": MultiDictService.DICT_NAMES[MultiDictService.DICT_BING],
            "word": "snag",
            "phonetic": "",
            "meaning": "slow result",
            "example": "",
        }

    monkeypatch.setattr(MultiDictService, "_aggregate_timeout", 0.05)
    monkeypatch.setattr(MultiDictService, "search_cambridge", staticmethod(fast_cambridge))
    monkeypatch.setattr(MultiDictService, "search_bing", staticmethod(slow_bing))
    monkeypatch.setattr(MultiDictService, "search_free_dict", staticmethod(lambda _word: None))

    try:
        result = MultiDictService.aggregate_search(
            "snag",
            enabled_dicts=[MultiDictService.DICT_CAMBRIDGE, MultiDictService.DICT_BING, MultiDictService.DICT_FREE],
            youdao_result=None,
        )
    finally:
        MultiDictService._aggregate_timeout = original_timeout

    assert result["primary"]["source"] == MultiDictService.DICT_CAMBRIDGE
    assert MultiDictService.DICT_CAMBRIDGE in result["sources"]
    assert MultiDictService.DICT_BING not in result["sources"]
