"""
routers/admin.py — Admin-only endpoints

Provides user management operations that require admin role.
All endpoints verify the caller has the 'admin' role before proceeding.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from backend.database import get_db
from backend.models import User, UserRole
from backend.schemas import UserResponse
from backend.auth import get_current_user, hash_password

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: raises 403 if the caller is not an admin."""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user


# ── Schemas ───────────────────────────────────────────────────────────────────

class AdminUserListItem(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str
    role: str
    district: str | None = None

    class Config:
        from_attributes = True


class AdminPasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=6, description="New plaintext password (min 6 chars)")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserListItem])
def list_all_users(
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """List all registered users. Admin only."""
    users = db.query(User).order_by(User.id).all()
    return [AdminUserListItem.model_validate(u) for u in users]


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    payload: AdminPasswordResetRequest,
    admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """
    Reset any user's password. Admin only.
    The admin's own identity is verified via JWT before proceeding.
    No OTP is generated or logged — the admin sets the new password directly.
    """
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use the profile settings to change your own password.",
        )

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target.password_hash = hash_password(payload.new_password)
    # Clear any stale OTP state from previous reset attempts
    target.otp_code = None
    target.otp_expires_at = None
    db.commit()

    return {
        "message": f"Password for {target.email} has been reset successfully.",
        "user_id": target.id,
        "email": target.email,
    }
