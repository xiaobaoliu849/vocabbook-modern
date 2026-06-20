import os
import sys

from fastapi.testclient import TestClient

CLOUD_SERVER_DIR = os.path.dirname(os.path.dirname(__file__))
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["ADMIN_TOKEN"] = "test-admin-token-0000000000000000"
_ORIGINAL_MODULES = {
    module_name: sys.modules.get(module_name)
    for module_name in ("auth", "base", "config", "main", "models", "routers", "schemas")
}
for module_name in ("auth", "base", "config", "main", "models", "routers", "schemas"):
    sys.modules.pop(module_name, None)
sys.path.insert(0, CLOUD_SERVER_DIR)

from main import app

sys.path.remove(CLOUD_SERVER_DIR)
for module_name in ("auth", "base", "config", "main", "models", "routers", "schemas"):
    sys.modules.pop(module_name, None)
    original_module = _ORIGINAL_MODULES[module_name]
    if original_module is not None:
        sys.modules[module_name] = original_module


def test_health_reports_database_and_environment():
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["database"] is True
    assert payload["environment"] == "development"



def test_admin_payment_readiness_requires_token():
    with TestClient(app) as client:
        response = client.get("/admin/payment/readiness")

    assert response.status_code == 403


def test_admin_payment_readiness_reports_plan_and_provider_state():
    with TestClient(app) as client:
        response = client.get(
            "/admin/payment/readiness",
            headers={"X-Admin-Token": "test-admin-token-0000000000000000"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plans"]["premium_monthly"]["amount_fen"] == 2900
    assert payload["plans"]["premium_monthly"]["license_days"] == 30
    assert payload["mock_payments_enabled"] is False
    assert payload["notify_url"]
