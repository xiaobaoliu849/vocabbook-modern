import asyncio

import pytest
from utils.import_utils import parse_csv_content


def test_process_import_handles_per_word_failures(monkeypatch, tmp_path):
    """A single lookup/audio failure must not abort the whole import."""
    from models.database import DatabaseManager
    from routers import import_words as import_words_router

    db = DatabaseManager(
        db_path=str(tmp_path / "import.db"),
        json_path=str(tmp_path / "missing.json"),
    )
    monkeypatch.setattr(import_words_router, "get_db", lambda: db)

    def fake_lookup(word):
        if word == "beta":
            raise RuntimeError("lookup boom")
        return {"phonetic": "/f/", "meaning": "含义", "example": "ex"}

    monkeypatch.setattr(import_words_router, "lookup_word", fake_lookup)

    def fake_ensure_audio(word, accent="us"):
        if word == "gamma":
            raise RuntimeError("audio down")
        return "/api/dict/audio/mock"

    from services import audio_service as audio_service_module

    monkeypatch.setattr(audio_service_module.AudioService, "ensure_audio", staticmethod(fake_ensure_audio))

    try:
        result = asyncio.run(import_words_router.process_import(
            [
                {"word": "alpha"},                         # lookup ok -> success
                {"word": "beta"},                          # lookup raises -> failed
                {"word": "gamma", "meaning": "已有释义"},  # audio raises -> failed
                {"word": "alpha"},                         # duplicate in batch -> skipped
            ],
            auto_lookup=True,
            tag="test",
        ))
    finally:
        db.close_all_connections()

    assert result.success == 1
    assert result.failed == 2
    assert result.skipped == 1
    statuses = {d["word"]: d["status"] for d in result.details}
    assert statuses == {"alpha": "success", "beta": "failed", "gamma": "failed"}
    assert db.get_word("alpha") is not None


def test_parse_csv_content_standard():
    """Test standard CSV with word and meaning"""
    content = "apple,苹果\nbanana,香蕉"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉"}
    ]

def test_parse_csv_content_full():
    """Test CSV with word, meaning, and phonetic (3 columns)"""
    content = "apple,苹果,/ˈæpl/\nbanana,香蕉,/bəˈnɑːnə/"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果", "phonetic": "/ˈæpl/"},
        {"word": "banana", "meaning": "香蕉", "phonetic": "/bəˈnɑːnə/"}
    ]

def test_parse_csv_content_only_word():
    """Test CSV with only word column"""
    content = "apple\nbanana"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple"},
        {"word": "banana"}
    ]

def test_parse_csv_content_with_spaces():
    """Test CSV with leading/trailing spaces in fields"""
    content = "  apple  ,  苹果  \n banana , 香蕉 , /bəˈnɑːnə/ "
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉", "phonetic": "/bəˈnɑːnə/"}
    ]

def test_parse_csv_content_empty_lines_and_first_column():
    """Test skipping empty lines and rows with empty first column"""
    content = "apple,苹果\n\n,meaning\n  \nbanana,香蕉"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉"}
    ]

def test_parse_csv_content_comments():
    """Test skipping comment lines starting with #"""
    content = "# This is a comment\napple,苹果\n # This is not a comment (space before #)\nbanana,香蕉"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉"}
    ]

def test_parse_csv_content_quoted_fields():
    """Test CSV with quoted fields containing commas"""
    content = '"apple, red",苹果\nbanana,"香蕉, 黄色"'
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple, red", "meaning": "苹果"},
        {"word": "banana", "meaning": "香蕉, 黄色"}
    ]

def test_parse_csv_content_extra_columns():
    """Test CSV with more than 3 columns (extra columns should be ignored)"""
    content = "apple,苹果,/ˈæpl/,extra1,extra2"
    result = parse_csv_content(content)
    assert result == [
        {"word": "apple", "meaning": "苹果", "phonetic": "/ˈæpl/"}
    ]
