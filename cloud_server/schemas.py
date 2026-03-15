from pydantic import BaseModel, EmailStr
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
    password: str

class UserLogin(UserBase):
    password: str

class UserResponse(UserBase):
    id: str
    is_active: bool
    tier: str
    license_expiry: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Payment ---
class PayRequest(BaseModel):
    description: str = "VocabBook Pro"
    amount_fen: int = 2900 # 29 CNY default

class PayResponse(BaseModel):
    code_url: str
    out_trade_no: str


class OrderStatusResponse(BaseModel):
    out_trade_no: str
    status: str
    amount_fen: int
    description: str
    trade_no: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MockPaySuccessRequest(BaseModel):
    out_trade_no: str


class AdminUserTierUpdateRequest(BaseModel):
    tier: Literal["free", "premium"]
    license_expiry: Optional[datetime] = None
    extend_days: Optional[int] = None


class AdminUserResponse(UserResponse):
    is_superuser: bool

    class Config:
        from_attributes = True


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
