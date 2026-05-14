from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.models.tenant import Tenant
from app.schemas.tenant import TenantOut


router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/current", response_model=TenantOut)
def get_current_tenant(auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == auth.tenant_id).first()
    return tenant

