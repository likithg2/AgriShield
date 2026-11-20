"""
routers/auth.py — Authentication Endpoints
Register, Login, Profile management, Password Reset
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
    EmailChangeRequest, EmailChangeVerify,
)
from backend.auth import (
    hash_password, verify_password, create_access_token, get_current_user,
)
from backend.communications import send_email_otp, send_sms_otp
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# In-memory store for pending email changes (not persisted across restarts)
PENDING_EMAIL_CHANGES = {}


# ── Registration ──────────────────────────────────────────────────────────────

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Register a new user and return a JWT token. No OTP required."""
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

    token = create_access_token(data={"sub": str(user.id)})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


# ── Password login ────────────────────────────────────────────────────────────

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


# ── OTP login (kept for backward compatibility; email delivery is console-only) ─

def _generate_otp() -> str:
    return str(random.randint(100000, 999999))


@router.post("/send-otp")
def send_otp(
    payload: OTPRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate a login OTP and store it in the database. Delivery is console-only."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found.",
        )

    otp = _generate_otp()
    user.otp_code = otp
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()

    if "@" in payload.login_id:
        background_tasks.add_task(send_email_otp, user.email, otp)
        return {"message": f"OTP generated for {user.email}. Check server logs."}
    else:
        background_tasks.add_task(send_sms_otp, user.phone, otp)
        return {"message": f"OTP generated for {user.phone}. Check server logs."}


@router.post("/verify-otp-login", response_model=Token)
def verify_otp_login(payload: OTPVerifyLogin, db: Session = Depends(get_db)):
    """Verify OTP and return JWT token."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP.")

    if user.otp_expires_at:
        exp = user.otp_expires_at if user.otp_expires_at.tzinfo else user.otp_expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OTP has expired.")

    user.otp_code = None
    user.otp_expires_at = None
    db.commit()

    token = create_access_token(data={"sub": str(user.id)})
    return Token(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


# ── Password reset ────────────────────────────────────────────────────────────

@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Self-service password reset is disabled (no email/SMS delivery available).
    Returns a 200 with instructions to contact an administrator, regardless of
    whether the account exists, to prevent user enumeration.
    """
    # Intentionally do not reveal whether the account exists (prevents enumeration)
    return {
        "message": (
            "Self-service password reset is not available. "
            "Please contact your administrator to have your password reset."
        )
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Verify reset OTP and update password."""
    user = db.query(User).filter(
        or_(User.email == payload.login_id, User.phone == payload.login_id)
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP.")

    if user.otp_expires_at:
        exp = user.otp_expires_at if user.otp_expires_at.tzinfo else user.otp_expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OTP has expired.")

    user.password_hash = hash_password(payload.new_password)
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()
    return {"message": "Password updated successfully. You can now log in."}


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    """Get the current user's profile."""
    return UserResponse.model_validate(current_user)


@router.delete("/me", status_code=status.HTTP_200_OK)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete the current user's account and all associated data.
    Requires a valid JWT — the user must be authenticated.
    """
    from backend.models import Prediction, Shipment, Notification, ChatSession, ChatMessage, ColdStorage

    # 1. Unassign warehouse if they are a warehouse manager
    if current_user.role == UserRole.warehouse_manager:
        for wh in db.query(ColdStorage).filter(ColdStorage.manager_id == current_user.id).all():
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


# ── Email change (authenticated; OTP delivery is console-only) ────────────────

@router.post("/request-email-otp")
def request_email_otp(
    payload: EmailChangeRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate an OTP for email change. Delivery is console-only."""
    existing = db.query(User).filter(User.email == payload.new_email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use.")

    otp = _generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    PENDING_EMAIL_CHANGES[current_user.id] = {"new_email": payload.new_email, "otp": otp, "expires": expires}

    background_tasks.add_task(send_email_otp, payload.new_email, otp)
    return {"message": f"OTP generated for {payload.new_email}. Check server logs."}


@router.post("/verify-email-otp", response_model=UserResponse)
def verify_email_otp(
    payload: EmailChangeVerify,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
