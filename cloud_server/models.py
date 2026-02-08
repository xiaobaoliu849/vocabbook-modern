import uuid
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    # License info
    tier = Column(String, default="free") # free, pro
    license_expiry = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"))
    
    out_trade_no = Column(String, unique=True, index=True) # Our system's order ID
    amount_fen = Column(Integer) # Amount in cents (fen)
    status = Column(String, default="PENDING") # PENDING, SUCCESS, FAIL
    
    description = Column(String)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
