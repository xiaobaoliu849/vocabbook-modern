"""
Shared EverMem helpers for routers.

Extracted from routers/ai.py and routers/review.py to eliminate code duplication.
"""
import base64
import json
import re
from typing import Optional

import logging

logger = logging.getLogger(__name__)


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Extract Bearer token from authorization header."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        return token or None
    return None


def is_enabled(value: Optional[str]) -> bool:
    """Parse common boolean header values."""
    return str(value).strip().lower() == "true"


def can_use_evermem(authorization: Optional[str]) -> bool:
    """Long-term memory writes require authenticated requests."""
    return extract_bearer_token(authorization) is not None


def normalize_scope_value(value: str) -> str:
    """Normalize a string into a safe scope identifier."""
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return normalized or "guest"


def extract_sub_from_jwt(token: str) -> Optional[str]:
    """Extract 'sub' claim from a JWT without verification."""
    try:
        payload_part = token.split(".")[1]
        padded = payload_part + ("=" * (-len(payload_part) % 4))
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.strip():
            return sub.strip()
    except Exception:
        pass
    return None


def prime_evermem_runtime(
    authorization: Optional[str],
    x_evermem_enabled: Optional[str],
    x_evermem_url: Optional[str],
    x_evermem_key: Optional[str],
    caller: str = "AI",
):
    """
    Resolve EverMem runtime service from request headers.

    Returns:
        (service, evermem_requested, evermem_enabled, authed)
    """
    from services.evermem_config import resolve_runtime_service

    evermem_requested = is_enabled(x_evermem_enabled)
    authed = can_use_evermem(authorization)
    evermem_enabled = evermem_requested and authed
    service = resolve_runtime_service(
        enabled=evermem_enabled,
        url=x_evermem_url,
        key=x_evermem_key,
    )
    if evermem_requested and not service:
        logger.debug(
            f"[EverMem {caller}] Runtime unavailable "
            f"requested={evermem_requested} enabled={evermem_enabled} "
            f"has_auth={authed} has_key={bool((x_evermem_key or '').strip())}"
        )
    return service, evermem_requested, evermem_enabled, authed
