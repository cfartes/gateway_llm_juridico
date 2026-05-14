from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.limiter import rate_limiter
from app.core.types import ScanStatus, TenantPlan
from app.models.scan_job import ScanJob
from app.models.tenant import Tenant


@dataclass(frozen=True)
class PlanQueuePolicy:
    max_inflight_jobs: int
    max_pending_jobs: int
    burst_per_minute: int


PLAN_POLICIES: dict[TenantPlan, PlanQueuePolicy] = {
    TenantPlan.STARTER: PlanQueuePolicy(max_inflight_jobs=2, max_pending_jobs=20, burst_per_minute=30),
    TenantPlan.GROWTH: PlanQueuePolicy(max_inflight_jobs=5, max_pending_jobs=80, burst_per_minute=100),
    TenantPlan.BUSINESS: PlanQueuePolicy(max_inflight_jobs=12, max_pending_jobs=250, burst_per_minute=300),
    TenantPlan.ENTERPRISE: PlanQueuePolicy(max_inflight_jobs=30, max_pending_jobs=1000, burst_per_minute=1200),
}

LIGHT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".xml", ".yaml", ".yml"}
HEAVY_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}

QUEUE_BY_TIER = {
    "light": "scan_light",
    "standard": "scan_standard",
    "heavy": "scan_heavy",
}


def resolve_tenant_plan(db: Session, tenant_id: str) -> TenantPlan:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or not tenant.plan:
        return TenantPlan.STARTER
    return tenant.plan


def classify_file_tier(filename: str) -> str:
    name = (filename or "").lower()
    extension = ""
    if "." in name:
        extension = name[name.rfind(".") :]

    if extension in LIGHT_EXTENSIONS:
        return "light"
    if extension in HEAVY_EXTENSIONS:
        return "heavy"
    return "standard"


def tier_to_queue(tier: str) -> str:
    return QUEUE_BY_TIER.get(tier, "scan_standard")


def get_tenant_scan_counters(db: Session, tenant_id: str) -> tuple[int, int]:
    pending_count = (
        db.query(func.count(ScanJob.id))
        .filter(ScanJob.tenant_id == tenant_id, ScanJob.status == ScanStatus.PENDING)
        .scalar()
        or 0
    )
    running_count = (
        db.query(func.count(ScanJob.id))
        .filter(ScanJob.tenant_id == tenant_id, ScanJob.status == ScanStatus.RUNNING)
        .scalar()
        or 0
    )
    return pending_count, running_count


def get_tenant_queue_policy_snapshot(db: Session, tenant_id: str, plan: TenantPlan | None = None) -> dict[str, int | str]:
    resolved_plan = plan or resolve_tenant_plan(db, tenant_id)
    policy = PLAN_POLICIES.get(resolved_plan, PLAN_POLICIES[TenantPlan.STARTER])
    pending_count, running_count = get_tenant_scan_counters(db, tenant_id)
    inflight = pending_count + running_count

    return {
        "plan": str(resolved_plan),
        "max_inflight_jobs": policy.max_inflight_jobs,
        "max_pending_jobs": policy.max_pending_jobs,
        "burst_per_minute": policy.burst_per_minute,
        "current_running_jobs": running_count,
        "current_pending_jobs": pending_count,
        "current_inflight_jobs": inflight,
    }


def enforce_scan_enqueue_policy(db: Session, tenant_id: str, plan: TenantPlan) -> None:
    policy = PLAN_POLICIES.get(plan, PLAN_POLICIES[TenantPlan.STARTER])

    pending_count, running_count = get_tenant_scan_counters(db, tenant_id)
    inflight = pending_count + running_count
    if inflight >= policy.max_inflight_jobs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Concurrent scan limit reached for plan '{plan}'. Try again shortly.",
        )

    if pending_count >= policy.max_pending_jobs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Queue backlog limit reached for plan '{plan}'. Try again later.",
        )

    rate_limiter.enforce(key=f"{tenant_id}:scan-burst", limit=policy.burst_per_minute, window_seconds=60)
