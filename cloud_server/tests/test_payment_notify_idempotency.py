import os
import sys
import tempfile

from fastapi.testclient import TestClient

CLOUD_SERVER_DIR = os.path.dirname(os.path.dirname(__file__))
_TMP_DIR = tempfile.mkdtemp(prefix="vocabbook-notify-test-")
_DB_PATH = os.path.join(_TMP_DIR, "notify_test.db").replace(os.sep, "/")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"
os.environ["ADMIN_TOKEN"] = "test-admin-token-0000000000000000"

_MODULES = ("auth", "base", "config", "main", "models", "rate_limit", "routers", "schemas")
_ORIGINAL_MODULES = {name: sys.modules.get(name) for name in _MODULES}
for name in _MODULES:
    sys.modules.pop(name, None)
sys.path.insert(0, CLOUD_SERVER_DIR)

from main import app  # noqa: E402
import routers as routers_module  # noqa: E402

sys.path.remove(CLOUD_SERVER_DIR)
for name in _MODULES:
    sys.modules.pop(name, None)
    original = _ORIGINAL_MODULES[name]
    if original is not None:
        sys.modules[name] = original


ADMIN_HEADERS = {"X-Admin-Token": "test-admin-token-0000000000000000"}
TRADE_NO = "ALIPAY_TRADE_123"


def _notify_params(out_trade_no: str) -> dict:
    return {
        "trade_status": "TRADE_SUCCESS",
        "out_trade_no": out_trade_no,
        "trade_no": TRADE_NO,
        "total_amount": "29.00",
        "app_id": routers_module.settings.ALIPAY_APP_ID,
        "sign": "ignored-signature",
        "sign_type": "RSA2",
    }


def _get_admin_user(client: TestClient, email: str) -> dict:
    response = client.get(
        "/admin/users", params={"search": email}, headers=ADMIN_HEADERS
    )
    assert response.status_code == 200
    return next(user for user in response.json() if user["email"] == email)


def test_duplicate_notify_applies_membership_only_once(monkeypatch):
    """Alipay retries its callback; the second notify must not extend the license."""
    monkeypatch.setattr(routers_module, "ALIPAY_PUBLIC_KEY", "dummy-public-key")
    monkeypatch.setattr(routers_module, "verify_with_rsa", lambda *args, **kwargs: True)

    email = "notify-buyer@example.com"
    with TestClient(app) as client:
        register = client.post("/register", json={"email": email, "password": "secret123"})
        assert register.status_code == 200

        token_response = client.post(
            "/token", data={"username": email, "password": "secret123"}
        )
        assert token_response.status_code == 200
        token = token_response.json()["access_token"]

        # Dev mode without Alipay keys creates a PENDING mock order.
        pay = client.post(
            "/api/pay/native",
            json={"plan_id": "premium_monthly"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert pay.status_code == 200
        out_trade_no = pay.json()["out_trade_no"]

        params = _notify_params(out_trade_no)

        first = client.post("/api/pay/alipay/notify", data=params)
        assert first.json() == "success"

        user_after_first = _get_admin_user(client, email)
        assert user_after_first["tier"] == "premium"
        first_expiry = user_after_first["license_expiry"]
        assert first_expiry

        second = client.post("/api/pay/alipay/notify", data=params)
        assert second.json() == "success"

        user_after_second = _get_admin_user(client, email)
        assert user_after_second["tier"] == "premium"
        # The retry must not stack another 30 days on top.
        assert user_after_second["license_expiry"] == first_expiry

        orders = client.get("/admin/orders", headers=ADMIN_HEADERS).json()
        order = next(o for o in orders if o["out_trade_no"] == out_trade_no)
        assert order["status"] == "SUCCESS"
        assert order["trade_no"] == TRADE_NO


def test_notify_rejects_amount_mismatch(monkeypatch):
    monkeypatch.setattr(routers_module, "ALIPAY_PUBLIC_KEY", "dummy-public-key")
    monkeypatch.setattr(routers_module, "verify_with_rsa", lambda *args, **kwargs: True)

    email = "notify-mismatch@example.com"
    with TestClient(app) as client:
        client.post("/register", json={"email": email, "password": "secret123"})
        token_response = client.post(
            "/token", data={"username": email, "password": "secret123"}
        )
        token = token_response.json()["access_token"]
        pay = client.post(
            "/api/pay/native",
            json={"plan_id": "premium_monthly"},
            headers={"Authorization": f"Bearer {token}"},
        )
        out_trade_no = pay.json()["out_trade_no"]

        params = _notify_params(out_trade_no)
        params["total_amount"] = "0.01"  # attacker-paid amount

        response = client.post("/api/pay/alipay/notify", data=params)
        assert response.json() == "fail"

        user = _get_admin_user(client, email)
        assert user["tier"] == "free"
