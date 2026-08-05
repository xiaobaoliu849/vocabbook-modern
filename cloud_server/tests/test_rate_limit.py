import os
import sys

import pytest

CLOUD_SERVER_DIR = os.path.dirname(os.path.dirname(__file__))
_MODULES = ("config", "rate_limit")
_ORIGINAL_MODULES = {name: sys.modules.get(name) for name in _MODULES}
for name in _MODULES:
    sys.modules.pop(name, None)
sys.path.insert(0, CLOUD_SERVER_DIR)

from config import Settings  # noqa: E402
from rate_limit import (  # noqa: E402
    FixedWindowRateLimiter,
    enforce_rate_limit,
    get_client_ip,
)

sys.path.remove(CLOUD_SERVER_DIR)
for name in _MODULES:
    sys.modules.pop(name, None)
    original = _ORIGINAL_MODULES[name]
    if original is not None:
        sys.modules[name] = original


class _FakeClient:
    def __init__(self, host):
        self.host = host


class _FakeRequest:
    def __init__(self, headers=None, host="203.0.113.9"):
        self.headers = headers or {}
        self.client = _FakeClient(host)


# --- FixedWindowRateLimiter ---


def test_limiter_allows_up_to_max_then_blocks():
    limiter = FixedWindowRateLimiter(max_requests=3, window_seconds=60)

    for _ in range(3):
        allowed, retry_after = limiter.check("key", now=100.0)
        assert allowed is True
        assert retry_after == 0

    allowed, retry_after = limiter.check("key", now=100.0)
    assert allowed is False
    assert retry_after >= 1


def test_limiter_window_resets_after_expiry():
    limiter = FixedWindowRateLimiter(max_requests=2, window_seconds=60)

    assert limiter.check("key", now=100.0) == (True, 0)
    assert limiter.check("key", now=101.0) == (True, 0)
    assert limiter.check("key", now=102.0)[0] is False

    # 60s after the window started -> fresh budget.
    assert limiter.check("key", now=160.0) == (True, 0)
    assert limiter.check("key", now=161.0) == (True, 0)
    assert limiter.check("key", now=162.0)[0] is False


def test_limiter_tracks_keys_independently():
    limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=60)

    assert limiter.check("a", now=100.0)[0] is True
    assert limiter.check("b", now=100.0)[0] is True
    assert limiter.check("a", now=100.0)[0] is False
    assert limiter.check("b", now=100.0)[0] is False


def test_limiter_disabled_when_max_is_zero():
    limiter = FixedWindowRateLimiter(max_requests=0, window_seconds=60)

    for _ in range(100):
        assert limiter.check("key", now=100.0) == (True, 0)


def test_retry_after_shrinks_toward_window_end():
    limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=60)

    limiter.check("key", now=100.0)
    limiter.check("key", now=100.0)  # blocked
    _, retry_after = limiter.check("key", now=155.0)
    assert retry_after <= 6


def test_enforce_raises_429_with_retry_after_header():
    limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=60)
    limiter.check("key")

    with pytest.raises(Exception) as exc_info:
        enforce_rate_limit(limiter, "key", "slow down")

    error = exc_info.value
    assert error.status_code == 429
    assert error.headers["Retry-After"].isdigit()
    assert error.detail == "slow down"


# --- get_client_ip ---


def test_client_ip_prefers_first_x_forwarded_for_entry():
    request = _FakeRequest(headers={"X-Forwarded-For": "198.51.100.7, 10.0.0.1"})
    assert get_client_ip(request) == "198.51.100.7"


def test_client_ip_falls_back_to_x_real_ip():
    request = _FakeRequest(headers={"X-Real-IP": "198.51.100.8"})
    assert get_client_ip(request) == "198.51.100.8"


def test_client_ip_falls_back_to_socket_peer():
    request = _FakeRequest()
    assert get_client_ip(request) == "203.0.113.9"


def test_client_ip_handles_missing_client():
    request = _FakeRequest()
    request.client = None
    assert get_client_ip(request) == "unknown"


# --- production validation of CHANGE_ME placeholders ---


def test_validation_rejects_change_me_placeholder_secrets(tmp_path):
    private_key = tmp_path / "private.pem"
    public_key = tmp_path / "public.pem"
    private_key.write_text("private-key", encoding="utf-8")
    public_key.write_text("public-key", encoding="utf-8")

    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="CHANGE_ME_TO_A_LONG_RANDOM_SECRET",  # long enough, still rejected
        ADMIN_TOKEN="CHANGE_ME_TO_A_LONG_RANDOM_ADMIN_TOKEN",
        ALIPAY_APP_ID="2026000000000000",
        ALIPAY_PRIVATE_KEY_PATH=str(private_key),
        ALIPAY_PUBLIC_KEY_PATH=str(public_key),
        ALIPAY_GATEWAY_URL="https://openapi.alipay.com/gateway.do",
        ALIPAY_NOTIFY_URL="https://api.historyai.fun/api/pay/alipay/notify",
        CORS_ORIGINS="https://api.historyai.fun",
        DEBUG_PAYMENT_MOCKS=False,
    )

    with pytest.raises(RuntimeError) as exc_info:
        settings.validate_runtime()

    message = str(exc_info.value)
    assert "SECRET_KEY" in message
    assert "ADMIN_TOKEN" in message
