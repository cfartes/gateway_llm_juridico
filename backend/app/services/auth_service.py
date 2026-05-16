from datetime import datetime, timedelta, timezone
import re

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_email_verification_token_secret,
    create_password_reset_token_secret,
    create_refresh_token_secret,
    hash_password,
    hash_email_verification_token,
    hash_password_reset_token,
    hash_refresh_token_secret,
    validate_password_strength,
    verify_email_verification_token,
    verify_password,
    verify_password_reset_token,
    verify_refresh_token_secret,
)
from app.core.types import UserRole
from app.models.email_verification_token import EmailVerificationToken
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest
from app.utils.br_docs import is_valid_cnpj, only_digits


def _slugify(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    base = re.sub(r"-{2,}", "-", base).strip("-")
    return base or "tenant"


def register_tenant_admin(db: Session, payload: RegisterRequest) -> User:
    validate_password_strength(payload.password)
    if not is_valid_cnpj(payload.cnpj):
        raise ValueError("CNPJ inválido")

    normalized_cnpj = only_digits(payload.cnpj)
    normalized_postal_code = only_digits(payload.postal_code)
    if len(normalized_postal_code) != 8:
        raise ValueError("CEP inválido")
    tenant_slug = (payload.tenant_slug or "").strip() or _slugify(payload.tenant_name)
    email = str(payload.email).strip().lower()

    existing_email = db.query(User).filter(User.email == email).first()
    if existing_email:
        raise ValueError("Email already in use")

    existing_cnpj = db.query(Tenant).filter(Tenant.cnpj == normalized_cnpj).first()
    if existing_cnpj:
        raise ValueError("CNPJ já cadastrado")

    existing_tenant = (
        db.query(Tenant)
        .filter((Tenant.slug == tenant_slug) | (Tenant.name == payload.tenant_name))
        .first()
    )
    if existing_tenant:
        raise ValueError("Tenant already exists")

    tenant = Tenant(
        name=payload.tenant_name.strip(),
        slug=tenant_slug,
        plan=payload.plan,
        cnpj=normalized_cnpj,
        legal_name=payload.legal_name.strip(),
        postal_code=normalized_postal_code,
        address_line=payload.address_line.strip(),
        address_number=payload.address_number.strip(),
        address_complement=(payload.address_complement or "").strip() or None,
        district=payload.district.strip(),
        city=payload.city.strip(),
        invoice_email=str(payload.invoice_email).strip().lower(),
    )
    user = User(
        tenant=tenant,
        email=email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole.ADMIN,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
        must_change_password=False,
    )
    db.add(tenant)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, payload: LoginRequest) -> User | None:
    user = (
        db.query(User)
        .filter(User.email == payload.email, User.is_active.is_(True))
        .first()
    )
    if not user:
        return None
    if not verify_password(payload.password, user.hashed_password):
        return None
    if user.email_verified_at is None:
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


def revoke_refresh_token(db: Session, raw_refresh_token: str | None) -> bool:
    if not raw_refresh_token:
        return False
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


def create_password_reset_flow(db: Session, email: str) -> str | None:
    user = (
        db.query(User)
        .filter(User.email == email, User.is_active.is_(True))
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


def create_email_verification_flow(db: Session, user: User) -> str:
    secret = create_email_verification_token_secret()
    token_hash = hash_email_verification_token(secret)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.email_verification_token_expire_hours)

    record = EmailVerificationToken(
        tenant_id=user.tenant_id,
        user_id=user.id,
        hashed_token=token_hash,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return f"{record.id}.{secret}"


def confirm_email_verification(db: Session, raw_verification_token: str) -> User | None:
    parts = raw_verification_token.split(".", 1)
    if len(parts) != 2:
        return None

    token_id, token_secret = parts
    record = db.query(EmailVerificationToken).filter(EmailVerificationToken.id == token_id).first()
    if not record:
        return None

    now = datetime.now(timezone.utc)
    if record.used_at is not None or record.expires_at < now:
        return None
    if not verify_email_verification_token(token_secret, record.hashed_token):
        return None

    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True)).first()
    if not user:
        return None

    user.email_verified_at = now
    record.used_at = now
    db.add(user)
    db.add(record)
    db.commit()
    db.refresh(user)
    return user


def change_first_access_password(db: Session, user: User, current_password: str, new_password: str) -> User:
    if not verify_password(current_password, user.hashed_password):
        raise ValueError("Current password is invalid")
    validate_password_strength(new_password)
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
