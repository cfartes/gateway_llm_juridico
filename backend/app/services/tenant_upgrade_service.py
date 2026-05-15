from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.types import TenantPlan
from app.models.tenant import Tenant
from app.models.tenant_upgrade_request import TenantUpgradeRequest
from app.services.webhook_delivery_service import send_ops_alert


PLAN_ORDER = [TenantPlan.STARTER, TenantPlan.GROWTH, TenantPlan.BUSINESS, TenantPlan.ENTERPRISE]


def _plan_index(plan: TenantPlan) -> int:
    return PLAN_ORDER.index(plan) if plan in PLAN_ORDER else 0


def _can_upgrade(current_plan: TenantPlan, requested_plan: TenantPlan) -> bool:
    return _plan_index(requested_plan) > _plan_index(current_plan)


def create_upgrade_request(
    db: Session,
    *,
    tenant_id: str,
    requested_by_user_id: str | None,
    requested_plan: TenantPlan,
    reason: str | None,
) -> TenantUpgradeRequest:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if not _can_upgrade(tenant.plan, requested_plan):
        raise HTTPException(
            status_code=400,
            detail=f"Requested plan must be higher than current plan '{tenant.plan}'.",
        )

    open_request = (
        db.query(TenantUpgradeRequest)
        .filter(TenantUpgradeRequest.tenant_id == tenant_id, TenantUpgradeRequest.status == "pending")
        .first()
    )
    if open_request:
        raise HTTPException(status_code=409, detail="There is already a pending upgrade request for this tenant.")

    item = TenantUpgradeRequest(
        tenant_id=tenant_id,
        requested_by_user_id=requested_by_user_id,
        current_plan=tenant.plan,
        requested_plan=requested_plan,
        status="pending",
        reason=reason.strip() if reason else None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    send_ops_alert(
        "tenant.plan.upgrade_requested",
        {
            "tenant": {"id": tenant.id, "name": tenant.name, "slug": tenant.slug},
            "request_id": item.id,
            "current_plan": str(item.current_plan),
            "requested_plan": str(item.requested_plan),
            "reason": item.reason,
            "requested_by_user_id": requested_by_user_id,
            "requested_at": item.created_at.isoformat() if item.created_at else None,
        },
    )

    return item


def list_tenant_upgrade_requests(db: Session, *, tenant_id: str, limit: int = 50) -> list[TenantUpgradeRequest]:
    capped_limit = max(1, min(limit, 200))
    return (
        db.query(TenantUpgradeRequest)
        .filter(TenantUpgradeRequest.tenant_id == tenant_id)
        .order_by(TenantUpgradeRequest.created_at.desc())
        .limit(capped_limit)
        .all()
    )


def list_upgrade_requests_for_superadmin(db: Session, *, status: str = "all", limit: int = 200) -> list[TenantUpgradeRequest]:
    capped_limit = max(1, min(limit, 500))
    query = db.query(TenantUpgradeRequest)
    if status != "all":
        query = query.filter(TenantUpgradeRequest.status == status)
    return query.order_by(TenantUpgradeRequest.created_at.desc()).limit(capped_limit).all()


def decide_upgrade_request(
    db: Session,
    *,
    request_id: str,
    actor_user_id: str | None,
    decision: str,
    admin_note: str | None,
    apply_plan_change: bool,
) -> TenantUpgradeRequest:
    item = db.query(TenantUpgradeRequest).filter(TenantUpgradeRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Upgrade request not found")
    if item.status != "pending":
        raise HTTPException(status_code=409, detail="Upgrade request already processed")

    tenant = db.query(Tenant).filter(Tenant.id == item.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if decision == "approved":
        item.status = "approved"
        if apply_plan_change:
            tenant.plan = item.requested_plan
            db.add(tenant)
    else:
        item.status = "rejected"

    item.admin_note = admin_note.strip() if admin_note else None
    item.processed_by_user_id = actor_user_id
    item.processed_at = datetime.now(timezone.utc)
    db.add(item)
    db.commit()
    db.refresh(item)

    send_ops_alert(
        f"tenant.plan.upgrade_{item.status}",
        {
            "tenant_id": item.tenant_id,
            "request_id": item.id,
            "current_plan": str(item.current_plan),
            "requested_plan": str(item.requested_plan),
            "status": item.status,
            "processed_by_user_id": actor_user_id,
            "processed_at": item.processed_at.isoformat() if item.processed_at else None,
            "admin_note": item.admin_note,
            "applied_plan_change": bool(decision == "approved" and apply_plan_change),
        },
    )

    return item
