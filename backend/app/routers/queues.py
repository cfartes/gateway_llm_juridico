from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.schemas.queue_overview import QueueOverviewOut
from app.services.queue_observability_service import build_queue_overview


router = APIRouter(prefix="/queues", tags=["queues"])
admin_router = APIRouter(prefix="/admin/queues", tags=["superadmin-queues"])


@router.get("/overview", response_model=QueueOverviewOut)
def get_tenant_queue_overview(
    window_hours: int = Query(default=24, ge=1, le=168),
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return QueueOverviewOut.model_validate(build_queue_overview(db, tenant_id=auth.tenant_id, window_hours=window_hours))


@admin_router.get("/overview", response_model=QueueOverviewOut)
def get_superadmin_queue_overview(
    window_hours: int = Query(default=24, ge=1, le=168),
    tenant_id: str | None = Query(default=None),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    return QueueOverviewOut.model_validate(build_queue_overview(db, tenant_id=tenant_id, window_hours=window_hours))
