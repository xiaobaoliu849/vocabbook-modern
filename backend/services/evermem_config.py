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

_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "evermem_config.json")
_cached_service: Optional[EverMemService] = None
_cached_key: Optional[str] = None


def save_config(enabled: bool, url: str = None, key: str = None):
    """Persist evermem config to disk. Called from AI chat router."""
    try:
        config = {
            "enabled": enabled,
            "url": url or "https://api.evermind.ai",
            "key": key or ""
        }
        with open(_CONFIG_PATH, "w") as f:
            json.dump(config, f)
    except Exception as e:
        logger.warning(f"Failed to save evermem config: {e}")


def get_service() -> Optional[EverMemService]:
    """Get a shared EverMemService instance, or None if not configured."""
    global _cached_service, _cached_key

    try:
        if not os.path.exists(_CONFIG_PATH):
            return None
        with open(_CONFIG_PATH, "r") as f:
            config = json.load(f)

        if not config.get("enabled") or not config.get("key"):
            return None

        # Re-use cached service if key hasn't changed
        current_key = config["key"]
        if _cached_service and _cached_key == current_key:
            return _cached_service

        _cached_service = EverMemService(
            api_url=config.get("url", "https://api.evermind.ai"),
            api_key=current_key
        )
        _cached_key = current_key
        return _cached_service
    except Exception as e:
        logger.warning(f"Failed to load evermem config: {e}")
        return None
