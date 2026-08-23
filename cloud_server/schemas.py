from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime

# --- Token ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# --- User ---
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    # min 8: no empty/1-char passwords; max 72: bcrypt silently truncates
    # beyond 72 bytes, which would quietly shrink the effective entropy.
    password: str = Field(min_length=8, max_length=72)

class UserLogin(UserBase):
    password: str

class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    tier: str
    license_expiry: Optional[datetime] = None
    created_at: datetime

# --- Payment ---
class PayRequest(BaseModel):
    plan_id: Literal["premium_monthly", "live_test_001"] = "premium_monthly"

class PayResponse(BaseModel):
    code_url: str
    out_trade_no: str


class OrderStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    out_trade_no: str
    status: str
    amount_fen: int
    description: str
    trade_no: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class MockPaySuccessRequest(BaseModel):
    out_trade_no: str


class AdminUserTierUpdateRequest(BaseModel):
    tier: Literal["free", "premium"]
    license_expiry: Optional[datetime] = None
    extend_days: Optional[int] = Field(default=None, gt=0, le=36500)


class AdminBatchTierRequest(BaseModel):
    user_ids: list[str] = Field(max_length=100)
    tier: Literal["free", "premium"]
    extend_days: Optional[int] = Field(default=30, gt=0, le=36500)


class AdminOrderStatusUpdateRequest(BaseModel):
    status: Literal["PENDING", "SUCCESS", "FAIL", "EXPIRED"]
    trade_no: Optional[str] = None
    extend_days: Optional[int] = Field(default=None, gt=0, le=36500)


class AdminUserResponse(UserResponse):
    model_config = ConfigDict(from_attributes=True)

    is_superuser: bool


class AdminOrderResponse(BaseModel):
    id: str
    user_id: str
    user_email: str
    out_trade_no: str
    trade_no: Optional[str] = None
    payment_method: str
    amount_fen: int
    status: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AdminSummaryResponse(BaseModel):
    total_users: int
    premium_users: int
    total_orders: int
    paid_orders: int


class PaymentReadinessResponse(BaseModel):
    alipay_configured: bool
    mock_payments_enabled: bool
    gateway_url: str
    notify_url: str
    plans: dict
