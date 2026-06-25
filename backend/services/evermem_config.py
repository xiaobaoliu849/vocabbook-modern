"""
Shared EverMemOS Configuration
Persists evermem settings so any router can access it (not just AI chat).
"""
import os
import json
import logging
import asyncio
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


def _is_oss_url(url: Optional[str]) -> bool:
    return "evermind.ai" not in _normalize_url(url).lower()


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


def _schedule_timezone_init(service: EverMemService) -> None:
    """Fire-and-forget coroutine to set timezone on Evermind.

    This ensures the server-side memory extraction engine understands
    time-relative expressions ("today", "yesterday") correctly.
    Called once whenever a new API key is registered so we don't hit
    the settings endpoint on every request.
    """
    if service.is_oss:
        return

    timezone = os.getenv("VOCABBOOK_TIMEZONE", "Asia/Shanghai")

    async def _do_set_timezone():
        try:
            result = await service.update_settings({"timezone": timezone})
            if result:
                logger.info(f"[EverMem] Timezone initialized to {timezone}")
            else:
                logger.warning("[EverMem] Timezone init returned no result (check API key/connectivity)")
        except Exception as exc:
            logger.warning(f"[EverMem] Timezone init failed: {exc}")

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_do_set_timezone())
    except RuntimeError:
        # No running event loop (e.g. called from a sync context / test).
        # Skip silently — the timezone will be set on the next async call.
        pass


def _schedule_sender_registration(service: EverMemService, user_id: str) -> None:
    """Fire-and-forget: register display names for the two sender IDs used in VocabBook.

    Registers:
      - <user_id>  → "学习者"         (the human learner)
      - "tutor_vocab" → "VocabBook 辅导员"  (the review/AI tutor bot)

    This is purely cosmetic: it makes the Evermind dashboard show readable
    participant names instead of raw IDs. Safe to call on every new key
    registration since the API upserts by sender_id.
    """
    if service.is_oss:
        return

    async def _do_register():
        try:
            r1 = await service.create_sender(sender_id=user_id, name="学习者")
            r2 = await service.create_sender(sender_id="tutor_vocab", name="VocabBook 辅导员")
            if r1 is not None and r2 is not None:
                logger.info("[EverMem] Sender display names registered (学习者 / VocabBook 辅导员)")
            else:
                logger.warning(
                    "[EverMem] Sender registration partial or failed "
                    f"learner={r1 is not None} "
                    f"tutor={r2 is not None}"
                )
        except Exception as exc:
            logger.warning(f"[EverMem] Sender registration failed: {exc}")

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_do_register())
    except RuntimeError:
        pass


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

        is_oss = _is_oss_url(resolved_url)
        if (isinstance(key, str) and key.strip()) or is_oss:
            in_memory_key = key.strip() if isinstance(key, str) and key.strip() else ""
            new_service = EverMemService(api_url=resolved_url, api_key=in_memory_key)
            _cached_service = new_service
            _cached_key = in_memory_key
            _cached_url = resolved_url
            # Fire-and-forget: set timezone so Evermind understands time-relative
            # references ("today", "yesterday") correctly for China Standard Time.
            _schedule_timezone_init(new_service)
            # Fire-and-forget: register readable display names for the two sender IDs.
            # Uses a placeholder user_id here; AI chat will use the real user_id at runtime.
            _schedule_sender_registration(new_service, user_id="vocab_user")
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

        is_oss = _is_oss_url(url)
        env_key = os.environ.get("EVERMEM_API_KEY", "").strip()
        current_key = _cached_key or env_key or legacy_key
        if not current_key and not is_oss:
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

    is_oss = _is_oss_url(resolved_url)
    if not runtime_key and not is_oss:
        logger.info("EverMem enabled for request but no runtime key is available.")
        return None

    try:
        return EverMemService(api_url=resolved_url, api_key=runtime_key)
    except Exception as e:
        logger.warning(f"Failed to build request-scoped evermem service: {e}")
        return None
