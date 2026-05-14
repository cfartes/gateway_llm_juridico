from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token_secret,
    create_refresh_token_secret,
    hash_password,
    hash_password_reset_token,
    hash_refresh_token_secret,
    validate_password_strength,
    verify_password,
    verify_password_reset_token,
    verify_refresh_token_secret,
)
from app.core.types import UserRole
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest


def register_tenant_admin(db: Session, payload: RegisterRequest) -> User:
    validate_password_strength(payload.password)

    existing_tenant = (
        db.query(Tenant)
        .filter((Tenant.slug == payload.tenant_slug) | (Tenant.name == payload.tenant_name))
        .first()
    )
    if existing_tenant:
        raise ValueError("Tenant already exists")

    tenant = Tenant(name=payload.tenant_name, slug=payload.tenant_slug)
    user = User(
        tenant=tenant,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(tenant)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, payload: LoginRequest) -> User | None:
    user = (
        db.query(User)
        .join(Tenant, Tenant.id == User.tenant_id)
        .filter(User.email == payload.email, Tenant.slug == payload.tenant_slug, User.is_active.is_(True))
        .first()
    )
    if not user:
        return None
    if not verify_password(payload.password, user.hashed_password):
        return None
    return user


def _create_refresh_token_record(db: Session, user: User) -> tuple[RefreshToken, str]:
    token_secret = create_refresh_token_secret()
    token_hash = hash_refresh_token_secret(token_secret)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    refresh = RefreshToken(
        tenant_id=user.tenant_id,
        user_id=user.id,
        hashed_token=token_hash,
        expires_at=expires_at,
    )
    db.add(refresh)
    db.commit()
    db.refresh(refresh)
    return refresh, token_secret


def issue_token_pair(db: Session, user: User) -> tuple[str, str]:
    access = create_access_token(subject=user.id, tenant_id=user.tenant_id, role=str(user.role))
    refresh_record, refresh_secret = _create_refresh_token_record(db, user)
    refresh_token = f"{refresh_record.id}.{refresh_secret}"
    return access, refresh_token


def rotate_refresh_token(db: Session, raw_refresh_token: str) -> tuple[User, str, str] | None:
    parts = raw_refresh_token.split(".", 1)
    if len(parts) != 2:
        return None

    refresh_id, refresh_secret = parts
    record = db.query(RefreshToken).filter(RefreshToken.id == refresh_id).first()
    if not record or record.revoked_at is not None:
        return None
    if record.expires_at < datetime.now(timezone.utc):
        return None
    if not verify_refresh_token_secret(refresh_secret, record.hashed_token):
        return None

    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True)).first()
    if not user:
        return None

    record.revoked_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()

    access, refresh = issue_token_pair(db, user)
    return user, access, refresh


def revoke_refresh_token(db: Session, raw_refresh_token: str) -> bool:
    parts = raw_refresh_token.split(".", 1)
    if len(parts) != 2:
        return False

    refresh_id, refresh_secret = parts
    record = db.query(RefreshToken).filter(RefreshToken.id == refresh_id).first()
    if not record or record.revoked_at is not None:
        return False
    if not verify_refresh_token_secret(refresh_secret, record.hashed_token):
        return False

    record.revoked_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()
    return True


def create_password_reset_flow(db: Session, tenant_slug: str, email: str) -> str | None:
    user = (
        db.query(User)
        .join(Tenant, Tenant.id == User.tenant_id)
        .filter(Tenant.slug == tenant_slug, User.email == email, User.is_active.is_(True))
        .first()
    )
    if not user:
        return None

    secret = create_password_reset_token_secret()
    token_hash = hash_password_reset_token(secret)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_expire_minutes)

    record = PasswordResetToken(
        tenant_id=user.tenant_id,
        user_id=user.id,
        hashed_token=token_hash,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return f"{record.id}.{secret}"


def confirm_password_reset(db: Session, raw_reset_token: str, new_password: str) -> bool:
    validate_password_strength(new_password)

    parts = raw_reset_token.split(".", 1)
    if len(parts) != 2:
        return False

    reset_id, reset_secret = parts
    record = db.query(PasswordResetToken).filter(PasswordResetToken.id == reset_id).first()
    if not record:
        return False

    now = datetime.now(timezone.utc)
    if record.used_at is not None or record.expires_at < now:
        return False
    if not verify_password_reset_token(reset_secret, record.hashed_token):
        return False

    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True)).first()
    if not user:
        return False

    user.hashed_password = hash_password(new_password)
    record.used_at = now

    db.add(user)
    db.add(record)
    db.commit()
    return True
