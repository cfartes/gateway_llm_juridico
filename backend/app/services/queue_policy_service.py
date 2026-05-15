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
    sync_requests_per_minute: int
    async_requests_per_minute: int
    url_requests_per_minute: int
    max_files_per_batch: int


PLAN_POLICIES: dict[TenantPlan, PlanQueuePolicy] = {
    TenantPlan.STARTER: PlanQueuePolicy(
        max_inflight_jobs=2,
        max_pending_jobs=20,
        burst_per_minute=30,
        sync_requests_per_minute=20,
        async_requests_per_minute=30,
        url_requests_per_minute=20,
        max_files_per_batch=3,
    ),
    TenantPlan.GROWTH: PlanQueuePolicy(
        max_inflight_jobs=5,
        max_pending_jobs=80,
        burst_per_minute=100,
        sync_requests_per_minute=60,
        async_requests_per_minute=100,
        url_requests_per_minute=60,
        max_files_per_batch=8,
    ),
    TenantPlan.BUSINESS: PlanQueuePolicy(
        max_inflight_jobs=12,
        max_pending_jobs=250,
        burst_per_minute=300,
        sync_requests_per_minute=180,
        async_requests_per_minute=300,
        url_requests_per_minute=180,
        max_files_per_batch=20,
    ),
    TenantPlan.ENTERPRISE: PlanQueuePolicy(
        max_inflight_jobs=30,
        max_pending_jobs=1000,
        burst_per_minute=1200,
        sync_requests_per_minute=600,
        async_requests_per_minute=1200,
        url_requests_per_minute=600,
        max_files_per_batch=50,
    ),
}

LIGHT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm", ".xml", ".yaml", ".yml"}
HEAVY_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}

QUEUE_BY_TIER = {
    "light": "scan_light",
    "standard": "scan_standard",
    "heavy": "scan_heavy",
}

PLAN_UPGRADE_ORDER = [
    TenantPlan.STARTER,
    TenantPlan.GROWTH,
    TenantPlan.BUSINESS,
    TenantPlan.ENTERPRISE,
]


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
    inflight_usage_percent = round((inflight / policy.max_inflight_jobs) * 100.0, 2) if policy.max_inflight_jobs else 0.0
    pending_usage_percent = round((pending_count / policy.max_pending_jobs) * 100.0, 2) if policy.max_pending_jobs else 0.0

    reasons: list[str] = []
    if inflight_usage_percent >= 80.0:
        reasons.append(
            f"In-flight usage at {inflight_usage_percent}% ({inflight}/{policy.max_inflight_jobs})."
        )
    if pending_usage_percent >= 80.0:
        reasons.append(
            f"Pending queue usage at {pending_usage_percent}% ({pending_count}/{policy.max_pending_jobs})."
        )

    recommended_plan: str | None = None
    current_index = PLAN_UPGRADE_ORDER.index(resolved_plan) if resolved_plan in PLAN_UPGRADE_ORDER else 0
    if reasons and current_index < len(PLAN_UPGRADE_ORDER) - 1:
        recommended_plan = str(PLAN_UPGRADE_ORDER[current_index + 1])

    upgrade_recommended = bool(reasons and recommended_plan)

    return {
        "plan": str(resolved_plan),
        "max_inflight_jobs": policy.max_inflight_jobs,
        "max_pending_jobs": policy.max_pending_jobs,
        "burst_per_minute": policy.burst_per_minute,
        "sync_requests_per_minute": policy.sync_requests_per_minute,
        "async_requests_per_minute": policy.async_requests_per_minute,
        "url_requests_per_minute": policy.url_requests_per_minute,
        "max_files_per_batch": policy.max_files_per_batch,
        "current_running_jobs": running_count,
        "current_pending_jobs": pending_count,
        "current_inflight_jobs": inflight,
        "inflight_usage_percent": inflight_usage_percent,
        "pending_usage_percent": pending_usage_percent,
        "upgrade_recommended": upgrade_recommended,
        "recommended_plan": recommended_plan,
        "upgrade_reasons": reasons,
    }


def enforce_plan_request_rate(tenant_id: str, plan: TenantPlan, *, operation: str) -> None:
    policy = PLAN_POLICIES.get(plan, PLAN_POLICIES[TenantPlan.STARTER])
    limits = {
        "sync": policy.sync_requests_per_minute,
        "async": policy.async_requests_per_minute,
        "url": policy.url_requests_per_minute,
    }
    resolved_limit = limits.get(operation, policy.burst_per_minute)
    rate_limiter.enforce(key=f"{tenant_id}:plan-rate:{operation}", limit=resolved_limit, window_seconds=60)


def enforce_batch_file_count(plan: TenantPlan, file_count: int) -> None:
    policy = PLAN_POLICIES.get(plan, PLAN_POLICIES[TenantPlan.STARTER])
    if file_count > policy.max_files_per_batch:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Batch file limit reached for plan '{plan}'. "
                f"Allowed: {policy.max_files_per_batch}, received: {file_count}."
            ),
        )


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
