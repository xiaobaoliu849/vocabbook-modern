import os
from unittest.mock import patch

import pytest

from services.audio_service import (
    AudioService,
    get_audio_api_path,
    get_audio_filepath,
    is_valid_audio_file,
)


@pytest.fixture
def audio_dir(tmp_path, monkeypatch):
    target = tmp_path / "word_audio"
    monkeypatch.setenv("VOCABBOOK_DATA_DIR", str(tmp_path))
    return target


def test_get_audio_api_path_encodes_word():
    path = get_audio_api_path("hello world", "us")
    assert path.startswith("/api/dict/audio/")
    assert "accent=us" in path


def test_is_valid_audio_file_rejects_small_files(audio_dir):
    audio_dir.mkdir(parents=True, exist_ok=True)
    filepath = audio_dir / "tiny.mp3"
    filepath.write_bytes(b"abc")
    assert is_valid_audio_file(str(filepath)) is False


def test_is_valid_audio_file_accepts_id3_header(audio_dir):
    audio_dir.mkdir(parents=True, exist_ok=True)
    filepath = audio_dir / "valid.mp3"
    filepath.write_bytes(b"ID3" + b"\x00" * 1200)
    assert is_valid_audio_file(str(filepath)) is True


def test_ensure_audio_uses_existing_cache(audio_dir, monkeypatch):
    monkeypatch.setattr("services.audio_service.WORD_AUDIO_DIR", str(audio_dir))
    audio_dir.mkdir(parents=True, exist_ok=True)

    filepath = get_audio_filepath("hello", "us")
    with open(filepath, "wb") as handle:
        handle.write(b"ID3" + b"\x00" * 1200)

    with patch("services.audio_service._download_youdao") as mock_youdao:
        result = AudioService.ensure_audio("hello", "us")

    assert result == get_audio_api_path("hello", "us")
    mock_youdao.assert_not_called()


def test_ensure_audio_downloads_when_missing(audio_dir, monkeypatch):
    monkeypatch.setattr("services.audio_service.WORD_AUDIO_DIR", str(audio_dir))

    with patch("services.audio_service._download_youdao", return_value=True) as mock_youdao:
        result = AudioService.ensure_audio("world", "us")

    assert result == get_audio_api_path("world", "us")
    mock_youdao.assert_called_once()
    assert os.path.basename(mock_youdao.call_args[0][2]) == os.path.basename(get_audio_filepath("world", "us"))