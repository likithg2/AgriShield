"""
routers/auth.py — Authentication Endpoints
Register, Login, Profile management
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import random

from backend.database import get_db
from backend.models import User, UserRole
from sqlalchemy import or_
from backend.schemas import (
    UserCreate, UserLogin, UserUpdate, UserResponse, Token,
    OTPRequest, OTPVerifyLogin, ForgotPasswordRequest, ResetPasswordRequest,
    RegisterOTPRequest, EmailChangeRequest, EmailChangeVerify
)
from backend.auth import (
    hash_password, verify_password, create_access_token, get_current_user,
)
from backend.communications import send_email_otp, send_sms_otp

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

PENDING_REGISTRATION_OTPS = {}
PENDING_EMAIL_CHANGES = {}

@router.post("/register-otp")
def send_register_otp(payload: RegisterOTPRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Send an OTP to verify email before registration."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )
    
    otp = str(random.randint(100000, 999999))
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    PENDING_REGISTRATION_OTPS[payload.email] = {"otp": otp, "expires": expires}
    
    background_tasks.add_task(send_email_otp, payload.email, otp)
    return {"message": f"Registration OTP sent to {payload.email}."}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Register a new user and return a JWT token."""
    # Verify OTP
    stored_otp = PENDING_REGISTRATION_OTPS.get(payload.email)
    if not stored_otp or stored_otp["otp"] != payload.otp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing OTP.",
        )
    if datetime.now(timezone.utc) > stored_otp["expires"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP has expired.",
        )

    # Check duplicate email
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    # Check duplicate phone
    existing_phone = db.query(User).filter(User.phone == payload.phone).first()
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this phone number already exists.",
        )

    user = User(
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole(payload.role),
        district=payload.district,
        managed_warehouse_id=payload.managed_warehouse_id if payload.role == "warehouse_manager" else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if payload.role == "warehouse_manager" and payload.managed_warehouse_id:
        from backend.models import ColdStorage
        wh = db.query(ColdStorage).filter(ColdStorage.id == payload.managed_warehouse_id).first()
        if wh:
            wh.manager_id = user.id
            db.commit()

    # Clear the OTP
    if payload.email in PENDING_REGISTRATION_OTPS:
        del PENDING_REGISTRATION_OTPS[payload.email]

    token = create_access_token(data={"sub": str(user.id)})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Login with email or phone and password. Returns JWT token."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account does not exist. Please create an account.",
        )
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password.",
        )

    token = create_access_token(data={"sub": str(user.id)})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


def generate_otp():
    return str(random.randint(100000, 999999))

@router.post("/send-otp")
def send_otp(payload: OTPRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Send an OTP to an email or phone number."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found.",
        )
        
    otp = generate_otp()
    user.otp_code = otp
    # UTC time for expiry (10 minutes)
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    
    if "@" in payload.login_id:
        background_tasks.add_task(send_email_otp, user.email, otp)
        return {"message": f"OTP sent successfully to email {user.email}."}
    else:
        background_tasks.add_task(send_sms_otp, user.phone, otp)
        return {"message": f"OTP sent successfully to phone {user.phone}."}


@router.post("/verify-otp-login", response_model=Token)
def verify_otp_login(payload: OTPVerifyLogin, db: Session = Depends(get_db)):
    """Verify OTP and return JWT token."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
        
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP.",
        )
        
    if user.otp_expires_at:
        exp = user.otp_expires_at if user.otp_expires_at.tzinfo else user.otp_expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="OTP has expired.",
            )
        
    # Clear OTP
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()
    
    token = create_access_token(data={"sub": str(user.id)})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Send a password reset OTP to email or phone."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found.",
        )
    
    otp = generate_otp()
    user.otp_code = otp
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()
    
    if "@" in payload.login_id:
        background_tasks.add_task(send_email_otp, user.email, otp)
        return {"message": f"Password reset OTP sent to {user.email}."}
    else:
        background_tasks.add_task(send_sms_otp, user.phone, otp)
        return {"message": f"Password reset OTP sent to {user.phone}."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Verify reset OTP and update password."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found.",
        )
        
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP.",
        )
        
    if user.otp_expires_at:
        exp = user.otp_expires_at if user.otp_expires_at.tzinfo else user.otp_expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="OTP has expired.",
            )
        
    user.password_hash = hash_password(payload.new_password)
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()
    return {"message": "Password updated successfully. You can now log in."}


@router.post("/request-email-otp")
def request_email_otp(payload: EmailChangeRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Send OTP for email change."""
    existing = db.query(User).filter(User.email == payload.new_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already in use.",
        )
    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    PENDING_EMAIL_CHANGES[current_user.id] = {"new_email": payload.new_email, "otp": otp, "expires": expires}
    
    background_tasks.add_task(send_email_otp, payload.new_email, otp)
    return {"message": f"OTP sent to {payload.new_email}."}


@router.post("/verify-email-otp", response_model=UserResponse)
def verify_email_otp(payload: EmailChangeVerify, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verify OTP and update email."""
    stored = PENDING_EMAIL_CHANGES.get(current_user.id)
    if not stored or stored["new_email"] != payload.new_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending email change for this address.")
    if stored["otp"] != payload.otp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP.")
    if datetime.now(timezone.utc) > stored["expires"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OTP expired.")
        
    current_user.email = payload.new_email
    db.commit()
    db.refresh(current_user)
    del PENDING_EMAIL_CHANGES[current_user.id]
    
    return UserResponse.model_validate(current_user)


@router.get("/me", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    """Get the current user's profile."""
    return UserResponse.model_validate(current_user)

@router.delete("/me", status_code=status.HTTP_200_OK)
def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete the current user's account and all associated data."""
    from backend.models import Prediction, Shipment, Notification, ChatSession, ChatMessage, ColdStorage
    
    # 1. Unassign warehouse if they are a warehouse manager
    if current_user.role == UserRole.warehouse_manager:
        managed_warehouses = db.query(ColdStorage).filter(ColdStorage.manager_id == current_user.id).all()
        for wh in managed_warehouses:
            wh.manager_id = None
            
    # 2. Delete Chat Messages and Sessions
    session_ids = [s.id for s in db.query(ChatSession.id).filter(ChatSession.user_id == current_user.id).all()]
    if session_ids:
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(ChatSession).filter(ChatSession.user_id == current_user.id).delete(synchronize_session=False)
    
    # 3. Delete Notifications related to user's shipments
    shipment_ids = [s.id for s in db.query(Shipment.id).filter(Shipment.user_id == current_user.id).all()]
    if shipment_ids:
        db.query(Notification).filter(Notification.shipment_id.in_(shipment_ids)).delete(synchronize_session=False)
        
    # 4. Delete Notifications for the user
    db.query(Notification).filter(Notification.user_id == current_user.id).delete(synchronize_session=False)
    
    # 5. Delete Shipments
    db.query(Shipment).filter(Shipment.user_id == current_user.id).delete(synchronize_session=False)
    
    # 6. Delete Predictions
    db.query(Prediction).filter(Prediction.user_id == current_user.id).delete(synchronize_session=False)
    
    # 7. Finally, delete the user
    db.delete(current_user)
    db.commit()
    
    return {"message": "Account successfully deleted."}

@router.put("/me", response_model=UserResponse)
def update_profile(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile fields."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.district is not None:
        current_user.district = payload.district

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)
