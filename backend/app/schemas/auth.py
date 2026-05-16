from datetime import datetime
from pydantic import BaseModel, EmailStr

from app.core.types import UserRole


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    must_change_password: bool = False


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    reset_token: str
    new_password: str


class EmailVerificationConfirmRequest(BaseModel):
    verification_token: str


class FirstAccessPasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordResetResponse(BaseModel):
    message: str
    reset_token: str | None = None


class RegisterRequest(BaseModel):
    tenant_name: str
    tenant_slug: str
    email: EmailStr
    full_name: str | None = None
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    tenant_id: str
    email: EmailStr
    full_name: str | None
    role: UserRole
    is_active: bool
    email_verified_at: datetime | None = None
    must_change_password: bool
    created_at: datetime

    model_config = {"from_attributes": True}
