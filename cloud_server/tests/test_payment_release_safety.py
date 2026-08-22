import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

CLOUD_SERVER_DIR = os.path.dirname(os.path.dirname(__file__))
_ORIGINAL_MODULES = {
    module_name: sys.modules.get(module_name)
    for module_name in ("auth", "base", "config", "models", "rate_limit", "routers", "schemas")
}
for module_name in ("auth", "base", "config", "models", "rate_limit", "routers", "schemas"):
    sys.modules.pop(module_name, None)
sys.path.insert(0, CLOUD_SERVER_DIR)

from models import Order, User
from base import Base
from config import Settings
from routers import (
    ORDER_EXPIRED,
    ORDER_PENDING,
    ORDER_SUCCESS,
    PAYMENT_PLANS,
    LIVE_TEST_PAYMENT_PLAN,
    _available_payment_plans,
    _amount_yuan_to_fen,
    _extend_premium,
    _license_days_for_order,
    _mark_order_terminal,
    _resolve_payment_plan,
    settings as router_settings,
)

sys.path.remove(CLOUD_SERVER_DIR)
for module_name in ("auth", "base", "config", "models", "rate_limit", "routers", "schemas"):
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
        created_at=datetime.now(timezone.utc),
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
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
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


async def _make_db():
    """Fresh in-memory database with the cloud schema."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, session_factory


def test_extend_premium_stacks_days_and_restarts_after_expiry():
    """The statement-based extension must stack concurrent activations instead
    of letting one overwrite the other's lost update."""

    async def scenario():
        engine, session_factory = await _make_db()
        try:
            async with session_factory() as db:
                db.add(make_user())
                await db.commit()

                # First activation from a free user: now + license days.
                await _extend_premium(db, "user_1", days=30)
                await db.commit()
                user = await db.get(User, "user_1")
                first_expiry = user.license_expiry
                assert user.tier == "premium"
                assert first_expiry is not None

                # A second activation (concurrent callback / admin extend)
                # must add its own days on top of the current expiry.
                await _extend_premium(db, "user_1", days=30)
                await db.commit()
                await db.refresh(user)
                assert user.license_expiry - first_expiry == timedelta(days=30)

                # Expired membership restarts from now, not from the stale past.
                past = datetime.now(timezone.utc) - timedelta(days=90)
                user.license_expiry = past
                await db.commit()
                await _extend_premium(db, "user_1", days=30)
                await db.commit()
                await db.refresh(user)
                # SQLite round-trips the column as naive UTC.
                expiry = user.license_expiry.replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                assert now + timedelta(days=29) < expiry < now + timedelta(days=31)

                # A missing user row must be a silent no-op (no FK enforcement).
                await _extend_premium(db, "ghost_user", days=30)
                await db.commit()
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_terminal_statement_never_overwrites_paid_order():

    async def scenario():
        engine, session_factory = await _make_db()
        try:
            async with session_factory() as db:
                paid = make_order(status=ORDER_SUCCESS)
                pending = make_order(status=ORDER_PENDING)
                pending.id = "order_2"
                pending.out_trade_no = "ORDER_2"
                db.add_all([paid, pending])
                await db.commit()

                # A late TRADE_CLOSED must not flip a paid order off SUCCESS.
                applied = await _mark_order_terminal(db, paid.id, ORDER_EXPIRED)
                await db.commit()
                refreshed = await db.get(Order, paid.id)
                assert applied is False
                assert refreshed.status == ORDER_SUCCESS

                # Pending orders transition normally.
                applied = await _mark_order_terminal(db, pending.id, ORDER_EXPIRED)
                await db.commit()
                refreshed = await db.get(Order, pending.id)
                assert applied is True
                assert refreshed.status == ORDER_EXPIRED
        finally:
            await engine.dispose()

    asyncio.run(scenario())


def test_production_runtime_validation_blocks_unsafe_defaults():
    settings = Settings(
        ENVIRONMENT="production",
        ADMIN_TOKEN="",
        ALIPAY_PRIVATE_KEY_PATH="/nonexistent/private.pem",
        ALIPAY_PUBLIC_KEY_PATH="/nonexistent/public.pem",
    )

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
