"""
Shared EverMemOS Configuration
Persists evermem settings so any router can access it (not just AI chat).
"""
import os
import json
import logging
from typing import Optional
from services.evermem_service import EverMemService

logger = logging.getLogger(__name__)

_DATA_DIR = os.environ.get("VOCABBOOK_DATA_DIR", os.path.dirname(os.path.dirname(__file__)))
_CONFIG_PATH = os.path.join(_DATA_DIR, "evermem_config.json")
_DEFAULT_URL = "https://api.evermind.ai"
_cached_service: Optional[EverMemService] = None
_cached_key: Optional[str] = None
_cached_url: Optional[str] = None


def _normalize_url(url: Optional[str]) -> str:
    return (url or _DEFAULT_URL).rstrip("/")


def _persist_config(enabled: bool, url: Optional[str]) -> None:
    # Never persist API key to disk.
    config = {
        "enabled": bool(enabled),
        "url": _normalize_url(url),
        "key_persisted": False
    }
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False)


def _load_persisted_config():
    enabled = False
    url = _DEFAULT_URL
    legacy_key = ""

    if not os.path.exists(_CONFIG_PATH):
        return enabled, url, legacy_key

    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)

        enabled = bool(config.get("enabled", False))
        url = _normalize_url(config.get("url", _DEFAULT_URL))

        # Backward compatibility: scrub old plaintext key if found.
        maybe_key = config.get("key")
        if isinstance(maybe_key, str) and maybe_key.strip():
            legacy_key = maybe_key.strip()
            logger.warning("Detected legacy plaintext EverMem key on disk; scrubbing persisted key.")
            _persist_config(enabled, url)
    except Exception as e:
        logger.warning(f"Failed to load evermem config: {e}")

    return enabled, url, legacy_key


def save_config(enabled: bool, url: str = None, key: str = None):
    """Persist evermem settings without storing plaintext key to disk."""
    global _cached_service, _cached_key, _cached_url

    resolved_url = _normalize_url(url)
    try:
        _persist_config(enabled, resolved_url)

        if not enabled:
            _cached_service = None
            _cached_key = None
            _cached_url = None
            return

        if isinstance(key, str) and key.strip():
            in_memory_key = key.strip()
            _cached_service = EverMemService(api_url=resolved_url, api_key=in_memory_key)
            _cached_key = in_memory_key
            _cached_url = resolved_url
            return

        # Keep existing in-memory key only when URL is unchanged.
        if _cached_service and _cached_url != resolved_url:
            _cached_service = None
            _cached_key = None
        _cached_url = resolved_url
    except Exception as e:
        logger.warning(f"Failed to save evermem config: {e}")


def get_service() -> Optional[EverMemService]:
    """Get a shared EverMemService instance, or None if not configured."""
    global _cached_service, _cached_key, _cached_url

    try:
        enabled, url, legacy_key = _load_persisted_config()
        if not enabled:
            _cached_service = None
            _cached_key = None
            _cached_url = None
            return None

        env_key = os.environ.get("EVERMEM_API_KEY", "").strip()
        current_key = _cached_key or env_key or legacy_key
        if not current_key:
            logger.info("EverMem enabled but no key in memory/environment.")
            return None

        if _cached_service and _cached_key == current_key and _cached_url == url:
            return _cached_service

        _cached_service = EverMemService(
            api_url=url,
            api_key=current_key
        )
        _cached_key = current_key
        _cached_url = url
        return _cached_service
    except Exception as e:
        logger.warning(f"Failed to initialize evermem service: {e}")
        return None


def resolve_runtime_service(
    enabled: bool,
    url: Optional[str] = None,
    key: Optional[str] = None,
) -> Optional[EverMemService]:
    """
    Build a request-scoped EverMem service without mutating shared process state.

    Request handlers should prefer this over save_config()/get_service() so one
    user's headers cannot disable or replace another request's runtime service.
    """
    if not enabled:
        return None

    persisted_enabled, persisted_url, legacy_key = _load_persisted_config()
    resolved_url = _normalize_url(url or (persisted_url if persisted_enabled else None))
    runtime_key = ""
    if isinstance(key, str) and key.strip():
        runtime_key = key.strip()
    else:
        runtime_key = os.environ.get("EVERMEM_API_KEY", "").strip() or legacy_key

    if not runtime_key:
        logger.info("EverMem enabled for request but no runtime key is available.")
        return None

    try:
        return EverMemService(api_url=resolved_url, api_key=runtime_key)
    except Exception as e:
        logger.warning(f"Failed to build request-scoped evermem service: {e}")
        return None
