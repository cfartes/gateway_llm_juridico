from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_auth_context
from app.core.limiter import rate_limit_dependency
from app.models.user import User
from app.schemas.auth import (
    EmailVerificationConfirmRequest,
    FirstAccessPasswordChangeRequest,
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetResponse,
    RegisterResponse,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services.audit_service import write_audit_log
from app.services.auth_service import (
    authenticate_user,
    change_first_access_password,
    confirm_email_verification,
    confirm_password_reset,
    create_password_reset_flow,
    issue_token_pair,
    register_tenant_admin,
    revoke_refresh_token,
    rotate_refresh_token,
    send_tenant_admin_verification_email,
)
from app.services.email_service import is_smtp_configured


router = APIRouter(prefix="/auth", tags=["auth"])


def _rate_limit(request: Request, suffix: str) -> None:
    ip = request.client.host if request.client else "unknown"
    rate_limit_dependency(request, key=f"auth:{suffix}:{ip}")


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        domain=settings.refresh_cookie_domain or None,
        path=settings.refresh_cookie_path,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        domain=settings.refresh_cookie_domain or None,
        path=settings.refresh_cookie_path,
    )


def _resolve_refresh_token(request: Request, payload_token: str | None) -> str | None:
    return payload_token or request.cookies.get(settings.refresh_cookie_name)


@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "register")
    if not settings.debug and not is_smtp_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP is not configured. SuperAdmin must configure SMTP before new registrations.",
        )
    try:
        user, verification_token = register_tenant_admin(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    send_tenant_admin_verification_email(
        recipient_email=user.email,
        full_name=user.full_name,
        verification_token=verification_token,
    )
    _clear_refresh_cookie(response)
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
    verification_for_debug = verification_token if settings.debug else None
    return RegisterResponse(
        message="Registration completed. Please confirm your email before login.",
        verification_token=verification_for_debug,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request, "login")
    user = authenticate_user(db, payload)
    if not user:
        pending = (
            db.query(User)
            .filter(User.email == payload.email, User.is_active.is_(True), User.email_verified_at.is_(None))
            .first()
        )
        if pending:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email not verified. Please confirm your invitation link first.",
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access, refresh = issue_token_pair(db, user)
    _set_refresh_cookie(response, refresh)
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
    return TokenResponse(access_token=access, must_change_password=bool(user.must_change_password))


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    request: Request,
    payload: RefreshTokenRequest | None = Body(default=None),
    db: Session = Depends(get_db),
):
    _rate_limit(request, "refresh")
    raw_refresh = _resolve_refresh_token(request, payload.refresh_token if payload else None)
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is required")

    refreshed = rotate_refresh_token(db, raw_refresh)
    if not refreshed:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user, access, refresh_token = refreshed
    _set_refresh_cookie(response, refresh_token)
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
    return TokenResponse(access_token=access, must_change_password=bool(user.must_change_password))


@router.post("/logout")
def logout(
    response: Response,
    request: Request,
    payload: LogoutRequest | None = Body(default=None),
    auth=Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    _rate_limit(request, "logout")
    raw_refresh = _resolve_refresh_token(request, payload.refresh_token if payload else None)
    revoked = revoke_refresh_token(db, raw_refresh) if raw_refresh else False
    _clear_refresh_cookie(response)

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
    token = create_password_reset_flow(db, str(payload.email))

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


@router.post("/email-confirm")
def confirm_email(
    payload: EmailVerificationConfirmRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    _rate_limit(request, "email-confirm")
    user = confirm_email_verification(db, payload.verification_token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    return {"message": "Email confirmed successfully. You can sign in now."}


@router.post("/first-access/change-password", response_model=TokenResponse)
def change_password_on_first_access(
    payload: FirstAccessPasswordChangeRequest,
    request: Request,
    response: Response,
    auth=Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    _rate_limit(request, "first-access-change-password")
    if auth.api_token_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API token cannot change user password")
    user = db.query(User).filter(User.id == auth.user_id, User.tenant_id == auth.tenant_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.must_change_password:
        raise HTTPException(status_code=400, detail="First access password change is not required")
    try:
        updated = change_first_access_password(db, user, payload.current_password, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    access, refresh = issue_token_pair(db, updated)
    _set_refresh_cookie(response, refresh)
    write_audit_log(
        db,
        tenant_id=updated.tenant_id,
        action="auth.first_access_password_change",
        resource_type="user",
        resource_id=updated.id,
        actor_user_id=updated.id,
        actor_api_token_id=None,
        source_ip=request.client.host if request.client else None,
        details={},
    )
    return TokenResponse(access_token=access, must_change_password=False)


@router.get("/me", response_model=UserOut)
def me(auth=Depends(get_auth_context), db: Session = Depends(get_db)):
    if not auth.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API token cannot access /me")
    user = db.query(User).filter_by(id=auth.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
