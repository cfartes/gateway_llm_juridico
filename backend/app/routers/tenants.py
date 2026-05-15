from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.tenant import Tenant
from app.schemas.tenant import TenantOut, TenantPlanUpdateRequest, TenantQueuePolicyOut
from app.schemas.tenant_upgrade import TenantUpgradeRequestCreate, TenantUpgradeRequestOut
from app.services.audit_service import write_audit_log
from app.services.queue_policy_service import get_tenant_queue_policy_snapshot
from app.services.tenant_upgrade_service import create_upgrade_request, list_tenant_upgrade_requests


router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/current", response_model=TenantOut)
def get_current_tenant(auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == auth.tenant_id).first()
    return tenant


@router.get("/current/queue-policy", response_model=TenantQueuePolicyOut)
def get_current_tenant_queue_policy(
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return get_tenant_queue_policy_snapshot(db, auth.tenant_id)


@router.patch("/current/plan", response_model=TenantOut)
def update_current_tenant_plan(
    payload: TenantPlanUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter(Tenant.id == auth.tenant_id).first()
    tenant.plan = payload.plan
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.plan.update",
        resource_type="tenant",
        resource_id=tenant.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"plan": str(payload.plan)},
    )

    return tenant


@router.get("/current/upgrade-requests", response_model=list[TenantUpgradeRequestOut])
def get_current_tenant_upgrade_requests(
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return list_tenant_upgrade_requests(db, tenant_id=auth.tenant_id)


@router.post("/current/upgrade-requests", response_model=TenantUpgradeRequestOut)
def create_current_tenant_upgrade_request(
    payload: TenantUpgradeRequestCreate,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    item = create_upgrade_request(
        db,
        tenant_id=auth.tenant_id,
        requested_by_user_id=auth.user_id,
        requested_plan=payload.requested_plan,
        reason=payload.reason,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.plan.upgrade_request.create",
        resource_type="tenant_upgrade_request",
        resource_id=item.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "current_plan": str(item.current_plan),
            "requested_plan": str(item.requested_plan),
            "reason": item.reason,
        },
    )
    return item

