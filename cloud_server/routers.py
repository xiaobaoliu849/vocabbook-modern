import json
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from wechatpayv3 import WeChatPay, WeChatPayType

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

# --- WeChat Pay Routes ---

# Initialize WeChatPay only if config is present (Lazy init or conditional)
wxpay = None
if settings.WECHAT_MCHID:
    try:
        with open(settings.WECHAT_PRIVATE_KEY_PATH) as f:
            private_key = f.read()
        wxpay = WeChatPay(
            wechatpay_type=WeChatPayType.NATIVE,
            mchid=settings.WECHAT_MCHID,
            private_key=private_key,
            cert_serial_no=settings.WECHAT_CERT_SERIAL_NO,
            apiv3_key=settings.WECHAT_APIV3_KEY,
            appid=settings.WECHAT_APPID,
            notify_url=settings.WECHAT_NOTIFY_URL
        )
    except Exception as e:
        print(f"WeChat Pay init failed (Expected during dev): {e}")

@app_router.post("/api/pay/native", response_model=PayResponse)
async def create_payment(req: PayRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not wxpay:
        # Mock for Dev
        return {"code_url": "weixin://wxpay/bizpayurl?pr=mock_qr_code", "out_trade_no": f"MOCK_{int(time.time())}"}
    
    out_trade_no = f"ORDER_{current_user.id}_{int(time.time())}"
    
    code, message = wxpay.pay(
        description=req.description,
        out_trade_no=out_trade_no,
        amount={'total': req.amount_fen},
        attach=current_user.id 
    )
    
    if code in [200, 202]: # 200 OK, 202 Accepted
        res_data = json.loads(message)
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
        
        return {"code_url": res_data.get('code_url'), "out_trade_no": out_trade_no}
    else:
        raise HTTPException(status_code=400, detail=f"WeChat Pay Error: {message}")

@app_router.post("/api/pay/notify")
async def pay_notify(request: Request, db: Session = Depends(get_db)):
    """Callback from WeChat Pay Server"""
    if not wxpay:
        return {"code": "FAIL", "message": "Config missing"}
        
    headers = request.headers
    body = await request.body()
    
    try:
        result = wxpay.callback(headers, body)
    except Exception as e:
        return {"code": "FAIL", "message": f"Sign Verify Failed: {e}"}

    if result and result.get('event_type') == 'TRANSACTION.SUCCESS':
        resource = result.get('resource')
        # resource is generic dict, 'decrypt_resource' handled by library? 
        # Actually wechatpay-py callback returns the DECRYPTED resource directly if verify passes
        
        out_trade_no = resource.get('out_trade_no')
        
        # 1. Update Order
        result = await db.execute(select(Order).where(Order.out_trade_no == out_trade_no))
        order = result.scalars().first()
        
        if order and order.status != 'SUCCESS':
            order.status = 'SUCCESS'
            order.updated_at = datetime.utcnow()
            
            # 2. Update User License
            u_res = await db.execute(select(User).where(User.id == order.user_id))
            user = u_res.scalars().first()
            if user:
                user.tier = 'premium'
                # user.license_expiry = ... (if subscription)
            
            await db.commit()
            
        return {"code": "SUCCESS", "message": "OK"}
        
    return {"code": "SUCCESS", "message": "Ignored"}
