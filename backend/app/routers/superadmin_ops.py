from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.schemas.ops_observability import OpsOverviewOut
from app.services.ops_observability_service import build_ops_overview


router = APIRouter(prefix="/admin/ops", tags=["superadmin-ops"])


@router.get("/overview", response_model=OpsOverviewOut)
def get_ops_overview(
    window_hours: int = Query(default=24, ge=1, le=168),
    tenant_id: str | None = Query(default=None),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    return OpsOverviewOut.model_validate(build_ops_overview(db, window_hours=window_hours, tenant_id=tenant_id))

