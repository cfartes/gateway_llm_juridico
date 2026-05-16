from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.core.config import settings
from app.core.security import hash_password
from app.core.types import UserRole
from app.models.tenant import Tenant
from app.models.user import User


def ensure_superadmin_account(db: Session) -> User:
    tenant = db.query(Tenant).filter(Tenant.slug == settings.superadmin_tenant_slug).first()
    if not tenant:
        tenant = Tenant(name=settings.superadmin_tenant_name, slug=settings.superadmin_tenant_slug, is_active=True)
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    user = db.query(User).filter(User.email == settings.superadmin_email).first()
    if user:
        changed = False
        if user.role != UserRole.SUPERADMIN:
            user.role = UserRole.SUPERADMIN
            changed = True
        if user.email_verified_at is None:
            user.email_verified_at = datetime.now(timezone.utc)
            changed = True
        if user.must_change_password:
            user.must_change_password = False
            changed = True
        if changed:
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    user = User(
        tenant_id=tenant.id,
        email=settings.superadmin_email,
        full_name=settings.superadmin_full_name,
        hashed_password=hash_password(settings.superadmin_password),
        role=UserRole.SUPERADMIN,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
