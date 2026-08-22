import asyncio
import json
import logging
import time
import secrets
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, and_
from sqlalchemy.exc import IntegrityError
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient
from alipay.aop.api.domain.AlipayTradePrecreateModel import AlipayTradePrecreateModel
from alipay.aop.api.request.AlipayTradePrecreateRequest import AlipayTradePrecreateRequest
from alipay.aop.api.util.SignatureUtils import verify_with_rsa

from base import get_db
from models import User, Order
from schemas import (
    UserCreate,
    UserResponse,
    Token,
    PayRequest,
    PayResponse,
    OrderStatusResponse,
    MockPaySuccessRequest,
    AdminUserTierUpdateRequest,
    AdminBatchTierRequest,
    AdminOrderStatusUpdateRequest,
    AdminUserResponse,
    AdminOrderResponse,
    AdminSummaryResponse,
    PaymentReadinessResponse,
)
import auth
from config import settings
from rate_limit import FixedWindowRateLimiter, enforce_rate_limit, get_client_ip

logger = logging.getLogger(__name__)

# --- Setup ---
app_router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

login_rate_limiter = FixedWindowRateLimiter(
    settings.RATE_LIMIT_LOGIN_MAX, settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS
)
register_rate_limiter = FixedWindowRateLimiter(
    settings.RATE_LIMIT_REGISTER_MAX, settings.RATE_LIMIT_REGISTER_WINDOW_SECONDS
)

ORDER_PENDING = "PENDING"
ORDER_SUCCESS = "SUCCESS"
ORDER_FAIL = "FAIL"
ORDER_EXPIRED = "EXPIRED"

PAYMENT_PLANS = {
    "premium_monthly": {
        "amount_fen": 2900,
        "description": "VocabBook Modern Premium - 1 Month",
        "license_days": 30,
    }
}

LIVE_TEST_PAYMENT_PLAN = {
    "amount_fen": 1,
    "description": "VocabBook Modern Premium - Live Payment Test",
    "license_days": 1,
}


def _available_payment_plans() -> dict:
    plans = dict(PAYMENT_PLANS)
    if settings.ENABLE_LIVE_TEST_PLAN:
        plans["live_test_001"] = LIVE_TEST_PAYMENT_PLAN
    return plans

# --- Dependencies ---
async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except auth.JWTError:
        raise credentials_exception
        
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user


async def require_admin_token(x_admin_token: str = Header(None, alias="X-Admin-Token")):
    configured_token = (settings.ADMIN_TOKEN or "").strip()
    if not configured_token:
        raise HTTPException(status_code=503, detail="Admin API is not configured")
    if not x_admin_token or not secrets.compare_digest(x_admin_token, configured_token):
        raise HTTPException(status_code=403, detail="Invalid admin token")
    return True

# --- Auth Routes ---

@app_router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    enforce_rate_limit(
        register_rate_limiter,
        f"register:{get_client_ip(request)}",
        "Too many registration attempts, please try again later",
    )
    hashed_pw = auth.get_password_hash(user.password)
    db_user = User(email=user.email, hashed_password=hashed_pw)
    try:
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")

@app_router.post("/token", response_model=Token)
async def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(
        login_rate_limiter,
        f"login:{get_client_ip(request)}:{form_data.username.strip().lower()}",
        "Too many login attempts, please try again later",
    )
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app_router.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- Alipay Routes ---


def _build_out_trade_no(prefix: str, user_id: str) -> str:
    """Build a collision-resistant order ID within Alipay length limits."""
    # Alipay requires out_trade_no length <= 64
    short_user = str(user_id).replace("-", "")[:12]
    return f"{prefix}_{short_user}_{int(time.time() * 1000)}_{uuid4().hex[:8]}"


async def _extend_premium(db: AsyncSession, user_id: str, days: int = 30, max_attempts: int = 5) -> bool:
    """Extend premium membership via compare-and-swap, retrying on races.

    The new expiry is computed in Python (extend from the current expiry while
    it is still in the future, otherwise from now) and written with a WHERE
    clause that only matches the expiry we read. Two concurrent activations —
    an Alipay callback racing another callback or an admin extend — therefore
    each add their own days instead of both writing stale_expiry + days and
    silently losing one payment. Column+timedelta arithmetic inside a single
    UPDATE is not portable across SQLAlchemy dialects, hence the CAS loop.

    Returns False only if the user row does not exist.
    """
    for _ in range(max_attempts):
        now = datetime.now(timezone.utc)
        row = (
            await db.execute(select(User.id, User.license_expiry).where(User.id == user_id))
        ).first()
        if row is None:
            return False
        current = row.license_expiry
        if current is not None and current.tzinfo is None:
            # SQLite drops tzinfo on write; stored values are UTC-naive.
            # Without this, naive-vs-aware comparison would raise TypeError
            # on every renewal of an existing membership.
            current = current.replace(tzinfo=timezone.utc)

        start_at = current if current and current > now else now
        conditions = [User.id == user_id]
        if current is None:
            conditions.append(User.license_expiry.is_(None))
        else:
            conditions.append(User.license_expiry == current)
        claimed = await db.execute(
            update(User)
            .where(and_(*conditions))
            .values(tier="premium", license_expiry=start_at + timedelta(days=days))
        )
        if claimed.rowcount == 1:
            return True
        # Another writer changed the expiry between our read and write —
        # re-read and retry with the fresh value.
    raise RuntimeError(f"_extend_premium lost {max_attempts} CAS races for user {user_id}")


def _resolve_payment_plan(plan_id: str) -> dict:
    plan = _available_payment_plans().get(plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Unknown payment plan")
    return plan


def _amount_yuan_to_fen(amount: str) -> int | None:
    try:
        return int((Decimal(amount).quantize(Decimal("0.01")) * 100).to_integral_value())
    except (InvalidOperation, TypeError, ValueError):
        return None


def _license_days_for_order(order: Order) -> int:
    for plan in _available_payment_plans().values():
        if order.amount_fen == plan["amount_fen"] and order.description == plan["description"]:
            return int(plan["license_days"])
    return 30


async def _claim_order_success(db: AsyncSession, order: Order, trade_no: str | None) -> bool:
    """Atomically transition an order to SUCCESS.

    Uses a filtered UPDATE instead of read-modify-write so concurrent
    Alipay callbacks race safely: only the first writer transitions the
    row (rowcount == 1) and earns membership activation. Losers must not
    touch the ORM object, or its stale state would be flushed back.
    """
    result = await db.execute(
        update(Order)
        .where(Order.id == order.id, Order.status != ORDER_SUCCESS)
        .values(
            status=ORDER_SUCCESS,
            trade_no=trade_no or order.trade_no,
            updated_at=datetime.now(timezone.utc),
        )
    )
    return result.rowcount == 1


async def _mark_order_terminal(db: AsyncSession, order_id: str, status_value: str) -> bool:
    """Transition an order to a terminal failure state unless already SUCCESS.

    Statement-based like _claim_order_success: a late TRADE_CLOSED callback
    can never overwrite a paid order's SUCCESS status, and concurrent
    close/notify callbacks cannot resurrect each other's writes.
    """
    result = await db.execute(
        update(Order)
        .where(Order.id == order_id, Order.status != ORDER_SUCCESS)
        .values(status=status_value, updated_at=datetime.now(timezone.utc))
    )
    return result.rowcount == 1


# Initialize Alipay
alipay_client = None
ALIPAY_PUBLIC_KEY = None

if settings.ALIPAY_APP_ID:
    try:
        with open(settings.ALIPAY_PRIVATE_KEY_PATH) as f:
            app_private_key = f.read()
        with open(settings.ALIPAY_PUBLIC_KEY_PATH) as f:
            public_key_content = f.read()
            ALIPAY_PUBLIC_KEY = public_key_content
            
        alipay_client_config = AlipayClientConfig()
        alipay_client_config.server_url = settings.ALIPAY_GATEWAY_URL
        alipay_client_config.app_id = settings.ALIPAY_APP_ID
        alipay_client_config.app_private_key = app_private_key
        alipay_client_config.alipay_public_key = ALIPAY_PUBLIC_KEY
        
        alipay_client = DefaultAlipayClient(alipay_client_config)
    except Exception as e:
        logger.warning(f"Alipay init failed (expected if files are missing during dev): {e}")

async def _create_payment_order(
    req: PayRequest,
    current_user: User,
    db: AsyncSession,
) -> PayResponse:
    plan = _resolve_payment_plan(req.plan_id)
    amount_fen = plan["amount_fen"]
    description = plan["description"]

    if not alipay_client:
        if settings.is_production:
            raise HTTPException(status_code=503, detail="Payment provider is not configured")
        # Mock for Dev if keys are missing - still persist order for status polling.
        out_trade_no = _build_out_trade_no("MOCK", current_user.id)
        new_order = Order(
            user_id=current_user.id,
            out_trade_no=out_trade_no,
            amount_fen=amount_fen,
            status=ORDER_PENDING,
            description=description
        )
        db.add(new_order)
        await db.commit()
        return PayResponse(code_url="https://qr.alipay.com/mock_qr_code", out_trade_no=out_trade_no)

    out_trade_no = _build_out_trade_no("ORDER", current_user.id)
    
    # 支付宝 Precreate Model (当面付 - 扫码支付)
    model = AlipayTradePrecreateModel()
    model.out_trade_no = out_trade_no
    model.total_amount = f"{amount_fen / 100:.2f}" # Alipay requires Yuan format e.g., "29.00"
    model.subject = description
    model.timeout_express = "30m" # 30 minutes until expiration
    
    request = AlipayTradePrecreateRequest(biz_model=model)
    request.notify_url = settings.ALIPAY_NOTIFY_URL
    
    try:
        # The SDK client is synchronous (blocking HTTPS to the Alipay gateway,
        # 1-5s when it is slow). Run it in the default thread pool so the
        # event loop keeps serving /health, /token and other users' requests.
        response_content = await asyncio.get_running_loop().run_in_executor(
            None, alipay_client.execute, request
        )
        # response_content is a JSON string (already extracted by SDK)
        api_response = json.loads(response_content)
        
        if api_response.get("code") == "10000": # 10000 means Success in Alipay API
            # Save Order
            new_order = Order(
                user_id=current_user.id,
                out_trade_no=out_trade_no,
                amount_fen=amount_fen,
                status=ORDER_PENDING,
                description=description
            )
            db.add(new_order)
            await db.commit()
            
            # qr_code field contains the URL to generate QR locally
            return PayResponse(code_url=api_response.get("qr_code"), out_trade_no=out_trade_no)
        else:
            logger.error(f"Alipay API failed. Raw response: {response_content}")
            raise HTTPException(status_code=400, detail=f"Alipay API Error: {response_content}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Payment execution failed")
        raise HTTPException(status_code=500, detail=f"Payment execution failed: {e}")


@app_router.post("/api/pay/alipay/precreate", response_model=PayResponse)
async def create_payment(req: PayRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _create_payment_order(req, current_user, db)


@app_router.post("/api/pay/native", response_model=PayResponse)
async def create_native_payment(req: PayRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _create_payment_order(req, current_user, db)


@app_router.get("/api/orders/{out_trade_no}", response_model=OrderStatusResponse)
async def get_order_status(
    out_trade_no: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(
            Order.out_trade_no == out_trade_no,
            Order.user_id == current_user.id,
        )
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@app_router.post("/api/pay/alipay/notify")
async def pay_notify(request: Request, db: AsyncSession = Depends(get_db)):
    """Callback from Alipay Server"""
    form_data = await request.form()
    params = dict(form_data)
    
    if not params:
        return {"msg": "fail"}
    
    # Extract signature and sign_type
    signature = params.pop("sign", None)
    params.pop("sign_type", None) # Typically RSA2, verify function might not need it in dict
    
    # Verify Signature
    try:
        # Use cached public key if available, otherwise try to read it (fallback)
        public_key = ALIPAY_PUBLIC_KEY
        if not public_key:
            with open(settings.ALIPAY_PUBLIC_KEY_PATH) as f:
                public_key = f.read()

        # Verify RSA2 signature
        is_valid = verify_with_rsa(public_key, params, signature)
        if not is_valid:
            logger.warning("Alipay signature verification failed")
            return "fail"
    except Exception as e:
        logger.error(f"Alipay verification error: {e}")
        return "fail"

    # Signature is valid, Check trade status
    trade_status = params.get("trade_status")
    if params.get("app_id") and params.get("app_id") != settings.ALIPAY_APP_ID:
        logger.warning(f"Alipay app_id mismatch: got={params.get('app_id')} expected={settings.ALIPAY_APP_ID}")
        return "fail"

    if trade_status in ["TRADE_SUCCESS", "TRADE_FINISHED"]:
        out_trade_no = params.get("out_trade_no")
        trade_no = params.get("trade_no") # Alipay's internal ID
        
        # 1. Update Order
        result = await db.execute(select(Order).where(Order.out_trade_no == out_trade_no))
        order = result.scalars().first()

        if not order:
            return "success"

        paid_amount_fen = _amount_yuan_to_fen(params.get("total_amount"))
        if paid_amount_fen != order.amount_fen:
            logger.warning(f"Alipay amount mismatch for {out_trade_no}: paid={paid_amount_fen} expected={order.amount_fen}")
            return "fail"
        
        if order.status != ORDER_SUCCESS:
            # 2. Claim the transition atomically: only the first concurrent
            # callback earns membership activation.
            claimed = await _claim_order_success(db, order, trade_no)
            if claimed:
                # Statement-based extension: safe against concurrent
                # activations and a missing user row (updates 0 rows).
                await _extend_premium(db, order.user_id, days=_license_days_for_order(order))
            elif trade_no:
                # Another callback won the race; only backfill the trade number
                # via a statement (mutating the ORM object would flush stale state).
                await db.execute(
                    update(Order)
                    .where(Order.id == order.id, Order.trade_no.is_(None))
                    .values(trade_no=trade_no, updated_at=datetime.now(timezone.utc))
                )
            await db.commit()
        else:
            # Already SUCCESS from a previous callback — nothing to activate.
            await db.commit()

        # VERY IMPORTANT: return 'success' plain text so Alipay stops retrying
        return "success"

    if trade_status == "TRADE_CLOSED":
        out_trade_no = params.get("out_trade_no")
        if out_trade_no:
            result = await db.execute(select(Order).where(Order.out_trade_no == out_trade_no))
            order = result.scalars().first()
            if order:
                await _mark_order_terminal(db, order.id, ORDER_EXPIRED)
                await db.commit()

    return "success"

@app_router.post("/api/pay/mock_success")
async def mock_pay_success(req: MockPaySuccessRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Mock endpoint for developers to mark a specific pending order as paid."""
    if not settings.DEBUG_PAYMENT_MOCKS:
        raise HTTPException(status_code=404, detail="Not found")

    result = await db.execute(
        select(Order).where(
            Order.out_trade_no == req.out_trade_no,
            Order.user_id == current_user.id
        )
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found for current user")

    if order.status != ORDER_PENDING:
        raise HTTPException(status_code=400, detail=f"Order status is {order.status}, expected PENDING")

    # Claim atomically so two concurrent mock calls cannot both pass the
    # PENDING check and double-extend membership.
    if not await _claim_order_success(db, order, f"MOCK_TRADE_{uuid4().hex[:16]}"):
        raise HTTPException(status_code=409, detail="Order was paid by a concurrent request")
    await _extend_premium(db, current_user.id, days=_license_days_for_order(order))
    await db.commit()
    return {"msg": "success", "out_trade_no": req.out_trade_no}


@app_router.get("/admin/payment/readiness", response_model=PaymentReadinessResponse)
async def admin_payment_readiness(_: bool = Depends(require_admin_token)):
    return PaymentReadinessResponse(
        alipay_configured=alipay_client is not None,
        mock_payments_enabled=settings.DEBUG_PAYMENT_MOCKS,
        gateway_url=settings.ALIPAY_GATEWAY_URL,
        notify_url=settings.ALIPAY_NOTIFY_URL,
        plans=_available_payment_plans(),
    )


@app_router.get("/admin/summary", response_model=AdminSummaryResponse)
async def admin_summary(
    _: bool = Depends(require_admin_token),
    db: AsyncSession = Depends(get_db),
):
    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    premium_users = await db.scalar(select(func.count()).select_from(User).where(User.tier == "premium")) or 0
    total_orders = await db.scalar(select(func.count()).select_from(Order)) or 0
    paid_orders = await db.scalar(select(func.count()).select_from(Order).where(Order.status == "SUCCESS")) or 0
    return AdminSummaryResponse(
        total_users=int(total_users),
        premium_users=int(premium_users),
        total_orders=int(total_orders),
        paid_orders=int(paid_orders),
    )


@app_router.get("/admin/users", response_model=list[AdminUserResponse])
async def admin_list_users(
    _: bool = Depends(require_admin_token),
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
    search: str = "",
):
    safe_limit = max(1, min(limit, 500))
    query = select(User)
    if search.strip():
        query = query.where(User.email.ilike(f"%{search.strip()}%"))
    result = await db.execute(
        query.order_by(User.created_at.desc()).limit(safe_limit)
    )
    return result.scalars().all()


@app_router.post("/admin/users/{user_id}/tier", response_model=AdminUserResponse)
async def admin_update_user_tier(
    user_id: str,
    payload: AdminUserTierUpdateRequest,
    _: bool = Depends(require_admin_token),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.tier == "free":
        user.tier = "free"
        user.license_expiry = None
    else:
        if payload.license_expiry is not None:
            user.tier = "premium"
            user.license_expiry = payload.license_expiry
        else:
            # Statement-based extension so an admin extend racing a payment
            # callback cannot lose either side's days.
            await _extend_premium(db, user_id, days=payload.extend_days or 30)

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@app_router.post("/admin/users/batch-tier")
async def admin_batch_update_tier(
    payload: AdminBatchTierRequest,
    _: bool = Depends(require_admin_token),
    db: AsyncSession = Depends(get_db),
):
    """Batch update tier for multiple users at once."""
    results = []
    for uid in payload.user_ids:
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalars().first()
        if not user:
            results.append({"user_id": uid, "status": "not_found"})
            continue
        if payload.tier == "free":
            user.tier = "free"
            user.license_expiry = None
            db.add(user)
            results.append({"user_id": uid, "status": "updated", "tier": user.tier})
        else:
            await _extend_premium(db, uid, days=payload.extend_days or 30)
            results.append({"user_id": uid, "status": "updated", "tier": "premium"})
    await db.commit()
    return {"results": results}


@app_router.get("/admin/orders", response_model=list[AdminOrderResponse])
async def admin_list_orders(
    _: bool = Depends(require_admin_token),
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
):
    safe_limit = max(1, min(limit, 500))
    order_rows = await db.execute(
        select(Order).order_by(Order.created_at.desc()).limit(safe_limit)
    )
    orders = order_rows.scalars().all()
    if not orders:
        return []

    user_ids = {order.user_id for order in orders}
    user_rows = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {user.id: user.email for user in user_rows.scalars().all()}

    return [
        AdminOrderResponse(
            id=order.id,
            user_id=order.user_id,
            user_email=users.get(order.user_id, ""),
            out_trade_no=order.out_trade_no,
            trade_no=order.trade_no,
            payment_method=order.payment_method,
            amount_fen=order.amount_fen,
            status=order.status,
            description=order.description,
            created_at=order.created_at,
            updated_at=order.updated_at,
        )
        for order in orders
    ]


@app_router.post("/admin/orders/{out_trade_no}/status", response_model=AdminOrderResponse)
async def admin_update_order_status(
    out_trade_no: str,
    payload: AdminOrderStatusUpdateRequest,
    _: bool = Depends(require_admin_token),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.out_trade_no == out_trade_no))
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Order user not found")

    if payload.status == ORDER_SUCCESS:
        # Claim atomically; a concurrent Alipay callback may have already
        # transitioned the order (then this is a no-op, matching the old
        # already-paid behavior).
        claimed = await _claim_order_success(
            db,
            order,
            payload.trade_no or order.trade_no or f"ADMIN_TRADE_{uuid4().hex[:16]}",
        )
        if claimed:
            await _extend_premium(
                db,
                order.user_id,
                days=payload.extend_days or _license_days_for_order(order),
            )
    elif payload.status == ORDER_PENDING:
        if order.status == ORDER_SUCCESS:
            raise HTTPException(status_code=400, detail="Paid orders cannot be moved back to PENDING")
        order.status = ORDER_PENDING
        order.updated_at = datetime.now(timezone.utc)
    else:
        await _mark_order_terminal(db, order.id, payload.status)

    db.add(order)
    db.add(user)
    await db.commit()
    await db.refresh(order)

    return AdminOrderResponse(
        id=order.id,
        user_id=order.user_id,
        user_email=user.email,
        out_trade_no=order.out_trade_no,
        trade_no=order.trade_no,
        payment_method=order.payment_method,
        amount_fen=order.amount_fen,
        status=order.status,
        description=order.description,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )
