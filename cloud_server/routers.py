import json
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from alipay.aop.api.AlipayClientConfig import AlipayClientConfig
from alipay.aop.api.DefaultAlipayClient import DefaultAlipayClient
from alipay.aop.api.domain.AlipayTradePrecreateModel import AlipayTradePrecreateModel
from alipay.aop.api.request.AlipayTradePrecreateRequest import AlipayTradePrecreateRequest
from alipay.aop.api.util.SignatureUtils import verify_with_rsa

from base import get_db
from models import User, Order
from schemas import UserCreate, UserResponse, Token, PayRequest, PayResponse
import auth
from config import settings

# --- Setup ---
app_router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Dependencies ---
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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

# --- Auth Routes ---

@app_router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, db: Session = Depends(get_db)):
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
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
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
        print(f"Alipay init failed (Expected if files are missing during dev): {e}")

@app_router.post("/api/pay/alipay/precreate", response_model=PayResponse)
async def create_payment(req: PayRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not alipay_client:
        # Mock for Dev if keys are missing
        return {"code_url": "https://qr.alipay.com/mock_qr_code", "out_trade_no": f"MOCK_{int(time.time())}"}
    
    out_trade_no = f"ORDER_{current_user.id}_{int(time.time())}"
    
    # 支付宝 Precreate Model (当面付 - 扫码支付)
    model = AlipayTradePrecreateModel()
    model.out_trade_no = out_trade_no
    model.total_amount = f"{req.amount_fen / 100:.2f}" # Alipay requires Yuan format e.g., "29.00"
    model.subject = req.description
    model.timeout_express = "30m" # 30 minutes until expiration
    
    request = AlipayTradePrecreateRequest(biz_model=model)
    request.notify_url = settings.ALIPAY_NOTIFY_URL
    
    try:
        response_content = alipay_client.execute(request)
        # response_content is a JSON string (already extracted by SDK)
        api_response = json.loads(response_content)
        
        if api_response.get("code") == "10000": # 10000 means Success in Alipay API
            # Save Order
            new_order = Order(
                user_id=current_user.id,
                out_trade_no=out_trade_no,
                amount_fen=req.amount_fen,
                status="PENDING",
                description=req.description
            )
            db.add(new_order)
            await db.commit()
            
            # qr_code field contains the URL to generate QR locally
            return {"code_url": api_response.get("qr_code"), "out_trade_no": out_trade_no}
        else:
            print(f"Alipay API Failed. Raw Response: {response_content}")
            raise HTTPException(status_code=400, detail=f"Alipay API Error: {response_content}")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Payment execution failed: {e}")

@app_router.post("/api/pay/alipay/notify")
async def pay_notify(request: Request, db: Session = Depends(get_db)):
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
            print("Alipay Signature Verification Failed")
            return "fail"
    except Exception as e:
        print(f"Alipay verification error: {e}")
        return "fail"

    # Signature is valid, Check trade status
    trade_status = params.get("trade_status")
    if trade_status in ["TRADE_SUCCESS", "TRADE_FINISHED"]:
        out_trade_no = params.get("out_trade_no")
        trade_no = params.get("trade_no") # Alipay's internal ID
        
        # 1. Update Order
        result = await db.execute(select(Order).where(Order.out_trade_no == out_trade_no))
        order = result.scalars().first()
        
        if order and order.status != 'SUCCESS':
            order.status = 'SUCCESS'
            order.trade_no = trade_no
            from datetime import datetime
            order.updated_at = datetime.utcnow()
            
            # 2. Update User License
            u_res = await db.execute(select(User).where(User.id == order.user_id))
            user = u_res.scalars().first()
            if user:
                user.tier = 'premium'
                # Optionally set license_expiry
            
            await db.commit()
            
        # VERY IMPORTANT: return 'success' plain text so Alipay stops retrying
        return "success"
        
    return "success"
