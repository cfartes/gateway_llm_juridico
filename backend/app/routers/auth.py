from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_auth_context
from app.core.limiter import rate_limit_dependency
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetResponse,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services.audit_service import write_audit_log
from app.services.auth_service import (
    authenticate_user,
    confirm_password_reset,
    create_password_reset_flow,
    issue_token_pair,
    register_tenant_admin,
    revoke_refresh_token,
    rotate_refresh_token,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def _rate_limit(request: Request, suffix: str) -> None:
    ip = request.client.host if request.client else "unknown"
    rate_limit_dependency(request, key=f"auth:{suffix}:{ip}")


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "register")
    try:
        user = register_tenant_admin(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    access, refresh = issue_token_pair(db, user)
    write_audit_log(
        db,
        tenant_id=user.tenant_id,
        action="auth.register",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        actor_api_token_id=None,
        source_ip=request.client.host if request.client else None,
        details={"email": user.email},
    )
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "login")
    user = authenticate_user(db, payload)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access, refresh = issue_token_pair(db, user)
    write_audit_log(
        db,
        tenant_id=user.tenant_id,
        action="auth.login",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        actor_api_token_id=None,
        source_ip=request.client.host if request.client else None,
        details={"tenant_id": user.tenant_id},
    )
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "refresh")
    refreshed = rotate_refresh_token(db, payload.refresh_token)
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user, access, refresh_token = refreshed
    write_audit_log(
        db,
        tenant_id=user.tenant_id,
        action="auth.refresh",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        actor_api_token_id=None,
        source_ip=request.client.host if request.client else None,
        details={},
    )
    return TokenResponse(access_token=access, refresh_token=refresh_token)


@router.post("/logout")
def logout(payload: LogoutRequest, request: Request, auth=Depends(get_auth_context), db: Session = Depends(get_db)):
    _rate_limit(request, "logout")
    revoked = revoke_refresh_token(db, payload.refresh_token)
    if revoked:
        write_audit_log(
            db,
            tenant_id=auth.tenant_id,
            action="auth.logout",
            resource_type="user",
            resource_id=auth.user_id,
            actor_user_id=auth.user_id,
            actor_api_token_id=auth.api_token_id,
            source_ip=request.client.host if request.client else None,
            details={},
        )
    return {"ok": True}


@router.post("/password-reset/request", response_model=PasswordResetResponse)
def request_password_reset(payload: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "password-reset-request")
    token = create_password_reset_flow(db, payload.tenant_slug, str(payload.email))

    # For production this should be sent by email provider; debug mode may return token for test automation.
    if settings.debug and token:
        return PasswordResetResponse(message="If account exists, reset flow has been started.", reset_token=token)
    return PasswordResetResponse(message="If account exists, reset flow has been started.")


@router.post("/password-reset/confirm")
def confirm_reset(payload: PasswordResetConfirmRequest, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "password-reset-confirm")
    changed = confirm_password_reset(db, payload.reset_token, payload.new_password)
    if not changed:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    return {"message": "Password updated successfully"}


@router.get("/me", response_model=UserOut)
def me(auth=Depends(get_auth_context), db: Session = Depends(get_db)):
    if not auth.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API token cannot access /me")
    user = db.query(User).filter_by(id=auth.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
