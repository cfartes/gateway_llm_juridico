from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.core.types import UserRole
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest


def register_tenant_admin(db: Session, payload: RegisterRequest) -> User:
    existing_tenant = db.query(Tenant).filter((Tenant.slug == payload.tenant_slug) | (Tenant.name == payload.tenant_name)).first()
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


def create_user_access_token(user: User) -> str:
    return create_access_token(subject=user.id, tenant_id=user.tenant_id, role=str(user.role))

