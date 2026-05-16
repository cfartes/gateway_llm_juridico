from app.core.config import settings
from app.core.security import hash_password
from app.core.types import UserRole
from app.models.user import User
from app.schemas.user_management import TenantUserCreateRequest
from app.services.auth_service import create_email_verification_flow
from app.services.email_service import send_email


def list_tenant_users(db, *, tenant_id: str) -> list[User]:
    return (
        db.query(User)
        .filter(User.tenant_id == tenant_id)
        .order_by(User.created_at.desc())
        .all()
    )


def _validate_create_role(requested: UserRole) -> None:
    if requested == UserRole.SUPERADMIN:
        raise ValueError("Cannot assign superadmin role in tenant user management.")


def create_tenant_user(db, *, tenant_id: str, payload: TenantUserCreateRequest) -> tuple[User, str]:
    existing = db.query(User).filter(User.email == str(payload.email).lower()).first()
    if existing:
        raise ValueError("Email already in use")
    _validate_create_role(payload.role)

    user = User(
        tenant_id=tenant_id,
        email=str(payload.email).lower(),
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(settings.tenant_user_temp_password),
        role=payload.role,
        is_active=True,
        email_verified_at=None,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    verification_token = create_email_verification_flow(db, user)
    return user, verification_token


def send_user_invitation_email(*, recipient_email: str, full_name: str | None, verification_token: str) -> None:
    confirm_link = f"{settings.frontend_base_url.rstrip('/')}/confirm-email?token={verification_token}"
    temp_password = settings.tenant_user_temp_password
    display_name = (full_name or "").strip() or recipient_email
    subject = "Nexus Gateway LLM Shield - Confirm your account"
    text_body = (
        f"Hello {display_name},\n\n"
        "Your tenant admin created your account in Nexus Gateway LLM Shield.\n"
        f"Temporary password: {temp_password}\n\n"
        "Before accessing the app, confirm your email using this link:\n"
        f"{confirm_link}\n\n"
        "After confirmation, login and change the temporary password on first access.\n"
    )
    html_body = (
        f"<p>Hello {display_name},</p>"
        "<p>Your tenant admin created your account in <b>Nexus Gateway LLM Shield</b>.</p>"
        f"<p><b>Temporary password:</b> <code>{temp_password}</code></p>"
        f"<p>Before accessing the app, confirm your email: <a href=\"{confirm_link}\">{confirm_link}</a></p>"
        "<p>After confirmation, login and change the temporary password on first access.</p>"
    )
    send_email(subject=subject, recipients=[recipient_email], body_text=text_body, body_html=html_body)
