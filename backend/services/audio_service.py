"""
Word pronunciation audio caching service.

Downloads audio from external sources, caches locally, and falls back to TTS
when online sources are unavailable.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import uuid
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

_DATA_DIR = os.environ.get("VOCABBOOK_DATA_DIR", os.path.dirname(os.path.dirname(__file__)))
WORD_AUDIO_DIR = os.path.join(_DATA_DIR, "word_audio")
MIN_VALID_BYTES = 1024
DEFAULT_TTS_VOICE = os.environ.get("VOCABBOOK_TTS_VOICE", "en-US-JennyNeural")


def ensure_audio_dir() -> None:
    os.makedirs(WORD_AUDIO_DIR, exist_ok=True)


def get_audio_filepath(word: str, accent: str = "us") -> str:
    key = f"{word.strip().lower()}:{accent}"
    filename = hashlib.md5(key.encode("utf-8")).hexdigest()[:16] + ".mp3"
    return os.path.join(WORD_AUDIO_DIR, filename)


def get_audio_api_path(word: str, accent: str = "us") -> str:
    return f"/api/dict/audio/{quote(word.strip())}?accent={accent}"


def is_valid_audio_file(path: str) -> bool:
    if not os.path.exists(path):
        return False
    try:
        size = os.path.getsize(path)
        if size < MIN_VALID_BYTES:
            return False
        with open(path, "rb") as handle:
            header = handle.read(4)
        return header[:3] == b"ID3" or (header[0] == 0xFF and (header[1] & 0xE0) == 0xE0)
    except OSError:
        return False


def _remove_invalid_file(path: str) -> None:
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError as exc:
            logger.debug(f"Failed to remove invalid audio file {path}: {exc}")


def _cleanup_temp_audio(tmp_path: str) -> None:
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except OSError as exc:
            logger.debug(f"Failed to remove temp audio {tmp_path}: {exc}")


def _write_audio_bytes(path: str, payload: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(payload)


def _download_from_url(url: str, filepath: str) -> bool:
    # Write to a unique temp file and atomically move into place: a failed or
    # interrupted download must never leave a half-written file at the final
    # cache path, and must never delete a valid file a concurrent download of
    # the same word just completed.
    tmp_path = f"{filepath}.{uuid.uuid4().hex[:8]}.tmp"
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            response = client.get(url)
            if response.status_code != 200:
                return False
            if len(response.content) < MIN_VALID_BYTES:
                return False
            _write_audio_bytes(tmp_path, response.content)
        if not is_valid_audio_file(tmp_path):
            logger.warning(f"Audio from {url} failed validation")
            return False
        os.replace(tmp_path, filepath)
        return True
    except Exception as exc:
        logger.warning(f"Audio download failed from {url}: {exc}")
        return False
    finally:
        _cleanup_temp_audio(tmp_path)


def _download_youdao(word: str, accent: str, filepath: str) -> bool:
    type_param = "1" if accent == "uk" else "2"
    url = f"https://dict.youdao.com/dictvoice?audio={quote(word.strip())}&type={type_param}"
    return _download_from_url(url, filepath)


def _download_free_dict(word: str, filepath: str) -> bool:
    cleaned = word.strip()
    if not cleaned or " " in cleaned:
        return False
    url = (
        "https://api.dictionaryapi.dev/media/pronunciations/en/"
        f"{quote(cleaned.lower())}-us.mp3"
    )
    return _download_from_url(url, filepath)


async def _download_tts(word: str, filepath: str) -> bool:
    # Same temp-file + atomic-replace contract as _download_from_url.
    tmp_path = f"{filepath}.{uuid.uuid4().hex[:8]}.tmp"
    try:
        import edge_tts

        communicate = edge_tts.Communicate(word.strip(), DEFAULT_TTS_VOICE, rate="+0%")
        await communicate.save(tmp_path)
        if not is_valid_audio_file(tmp_path):
            logger.warning(f"TTS fallback produced invalid audio for '{word}'")
            return False
        os.replace(tmp_path, filepath)
        return True
    except Exception as exc:
        logger.warning(f"TTS fallback failed for '{word}': {exc}")
        return False
    finally:
        _cleanup_temp_audio(tmp_path)


def _run_tts_download(word: str, filepath: str) -> bool:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(_download_tts(word, filepath))

    if loop.is_running():
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, _download_tts(word, filepath)).result(timeout=30)
    return asyncio.run(_download_tts(word, filepath))


class AudioService:
    @staticmethod
    def get_cached_filepath(word: str, accent: str = "us") -> str | None:
        filepath = get_audio_filepath(word, accent)
        if is_valid_audio_file(filepath):
            return filepath
        _remove_invalid_file(filepath)
        return None

    @staticmethod
    def ensure_audio(word: str, accent: str = "us") -> str | None:
        """Ensure pronunciation audio exists locally. Returns API path or None."""
        cleaned = word.strip()
        if not cleaned:
            return None

        ensure_audio_dir()
        filepath = get_audio_filepath(cleaned, accent)

        if is_valid_audio_file(filepath):
            return get_audio_api_path(cleaned, accent)

        _remove_invalid_file(filepath)

        if _download_youdao(cleaned, accent, filepath):
            logger.debug(f"[Audio] Cached Youdao audio for '{cleaned}' ({accent})")
            return get_audio_api_path(cleaned, accent)

        if accent == "us" and _download_free_dict(cleaned, filepath):
            logger.debug(f"[Audio] Cached FreeDict audio for '{cleaned}'")
            return get_audio_api_path(cleaned, accent)

        if _run_tts_download(cleaned, filepath):
            logger.debug(f"[Audio] Cached TTS audio for '{cleaned}'")
            return get_audio_api_path(cleaned, accent)

        logger.warning(f"[Audio] Unable to cache audio for '{cleaned}' ({accent})")
        return None

    @staticmethod
    def normalize_accent(accent: str | None) -> str:
        if accent and accent.lower() == "uk":
            return "uk"
        return "us"

    @staticmethod
    def is_single_word(text: str) -> bool:
        cleaned = text.strip()
        if not cleaned:
            return False
        return bool(re.fullmatch(r"[A-Za-z][A-Za-z\-']*", cleaned))