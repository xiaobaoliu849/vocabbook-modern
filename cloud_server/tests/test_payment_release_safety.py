import os
import sys
from datetime import datetime

import pytest

CLOUD_SERVER_DIR = os.path.dirname(os.path.dirname(__file__))
_ORIGINAL_MODULES = {
    module_name: sys.modules.get(module_name)
    for module_name in ("auth", "base", "config", "models", "routers", "schemas")
}
for module_name in ("auth", "base", "config", "models", "routers", "schemas"):
    sys.modules.pop(module_name, None)
sys.path.insert(0, CLOUD_SERVER_DIR)

from models import Order, User
from config import Settings
from routers import (
    ORDER_EXPIRED,
    ORDER_PENDING,
    ORDER_SUCCESS,
    PAYMENT_PLANS,
    LIVE_TEST_PAYMENT_PLAN,
    _available_payment_plans,
    _amount_yuan_to_fen,
    _license_days_for_order,
    _mark_order_success,
    _mark_order_terminal,
    _resolve_payment_plan,
    settings as router_settings,
)

sys.path.remove(CLOUD_SERVER_DIR)
for module_name in ("auth", "base", "config", "models", "routers", "schemas"):
    sys.modules.pop(module_name, None)
    original_module = _ORIGINAL_MODULES[module_name]
    if original_module is not None:
        sys.modules[module_name] = original_module


def make_user() -> User:
    return User(
        id="user_1",
        email="buyer@example.com",
        hashed_password="hash",
        tier="free",
        created_at=datetime.utcnow(),
    )


def make_order(status: str = ORDER_PENDING) -> Order:
    plan = PAYMENT_PLANS["premium_monthly"]
    return Order(
        id="order_1",
        user_id="user_1",
        out_trade_no="ORDER_1",
        amount_fen=plan["amount_fen"],
        status=status,
        description=plan["description"],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


def test_payment_plan_is_server_controlled():
    plan = _resolve_payment_plan("premium_monthly")

    assert plan["amount_fen"] == 2900
    assert plan["license_days"] == 30

    with pytest.raises(Exception):
        _resolve_payment_plan("client_supplied_discount")


def test_live_payment_test_plan_is_disabled_by_default(monkeypatch):
    monkeypatch.setattr(router_settings, "ENABLE_LIVE_TEST_PLAN", False)

    assert "live_test_001" not in _available_payment_plans()

    with pytest.raises(Exception):
        _resolve_payment_plan("live_test_001")


def test_live_payment_test_plan_can_be_enabled_temporarily(monkeypatch):
    monkeypatch.setattr(router_settings, "ENABLE_LIVE_TEST_PLAN", True)

    plan = _resolve_payment_plan("live_test_001")

    assert plan == LIVE_TEST_PAYMENT_PLAN
    assert plan["amount_fen"] == 1
    assert plan["license_days"] == 1


def test_yuan_to_fen_conversion_rejects_invalid_amounts():
    assert _amount_yuan_to_fen("29.00") == 2900
    assert _amount_yuan_to_fen("29") == 2900
    assert _amount_yuan_to_fen("abc") is None
    assert _amount_yuan_to_fen(None) is None


def test_mark_order_success_extends_membership_once():
    user = make_user()
    order = make_order()

    first_applied = _mark_order_success(order, user, "TRADE_1", _license_days_for_order(order))
    first_expiry = user.license_expiry

    second_applied = _mark_order_success(order, user, "TRADE_1", _license_days_for_order(order))

    assert first_applied is True
    assert second_applied is False
    assert order.status == ORDER_SUCCESS
    assert order.trade_no == "TRADE_1"
    assert user.tier == "premium"
    assert user.license_expiry == first_expiry


def test_terminal_status_never_overwrites_paid_order():
    order = make_order(status=ORDER_SUCCESS)

    _mark_order_terminal(order, ORDER_EXPIRED)

    assert order.status == ORDER_SUCCESS


def test_production_runtime_validation_blocks_unsafe_defaults():
    settings = Settings(ENVIRONMENT="production", ADMIN_TOKEN="")

    with pytest.raises(RuntimeError) as exc_info:
        settings.validate_runtime()

    message = str(exc_info.value)
    assert "SECRET_KEY" in message
    assert "ADMIN_TOKEN" in message
    assert "ALIPAY_APP_ID" in message
    assert "ALIPAY_PRIVATE_KEY_PATH" in message
    assert "ALIPAY_PUBLIC_KEY_PATH" in message
    assert "ALIPAY_GATEWAY_URL" in message
    assert "ALIPAY_NOTIFY_URL" in message


def test_production_runtime_validation_accepts_release_configuration(tmp_path):
    private_key = tmp_path / "private.pem"
    public_key = tmp_path / "public.pem"
    private_key.write_text("private-key", encoding="utf-8")
    public_key.write_text("public-key", encoding="utf-8")

    settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="x" * 32,
        ADMIN_TOKEN="y" * 32,
        ALIPAY_APP_ID="2026000000000000",
        ALIPAY_PRIVATE_KEY_PATH=str(private_key),
        ALIPAY_PUBLIC_KEY_PATH=str(public_key),
        ALIPAY_GATEWAY_URL="https://openapi.alipay.com/gateway.do",
        ALIPAY_NOTIFY_URL="https://api.historyai.fun/api/pay/alipay/notify",
        CORS_ORIGINS="https://api.historyai.fun",
        DEBUG_PAYMENT_MOCKS=False,
    )

    settings.validate_runtime()
