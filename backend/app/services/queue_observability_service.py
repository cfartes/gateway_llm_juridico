from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.types import ScanStatus
from app.models.document import Document
from app.models.scan_job import ScanJob
from app.services.queue_policy_service import PLAN_POLICIES, classify_file_tier, resolve_tenant_plan, tier_to_queue


@dataclass
class _Bucket:
    queue_name: str
    pending_jobs: int = 0
    running_jobs: int = 0
    completed_window: int = 0
    failed_window: int = 0
    duration_sum_seconds: float = 0.0
    duration_count: int = 0
    last_completed_at: datetime | None = None

    @property
    def avg_processing_seconds(self) -> float:
        if self.duration_count <= 0:
            return 0.0
        return self.duration_sum_seconds / self.duration_count


def _new_buckets() -> dict[str, _Bucket]:
    return {
        "scan_light": _Bucket(queue_name="scan_light"),
        "scan_standard": _Bucket(queue_name="scan_standard"),
        "scan_heavy": _Bucket(queue_name="scan_heavy"),
    }


def _queue_worker_slots() -> dict[str, int]:
    return {
        "scan_light": max(1, int(settings.queue_eta_worker_slots_light)),
        "scan_standard": max(1, int(settings.queue_eta_worker_slots_standard)),
        "scan_heavy": max(1, int(settings.queue_eta_worker_slots_heavy)),
    }


def _estimate_wait_seconds(pending_jobs: int, avg_seconds: float, slots: int) -> float:
    baseline = avg_seconds if avg_seconds > 0 else 30.0
    return max(0.0, (pending_jobs * baseline) / max(1, slots))


def build_queue_overview(db: Session, *, tenant_id: str | None = None, window_hours: int = 24) -> dict:
    window = max(1, min(window_hours, 168))
    since = datetime.now(timezone.utc) - timedelta(hours=window)

    buckets = _new_buckets()
    slots = _queue_worker_slots()

    active_query = (
        db.query(ScanJob.status, Document.original_name)
        .join(Document, ScanJob.document_id == Document.id)
        .filter(ScanJob.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING]))
    )
    if tenant_id:
        active_query = active_query.filter(ScanJob.tenant_id == tenant_id)

    for status, original_name in active_query.all():
        queue = tier_to_queue(classify_file_tier(original_name or ""))
        bucket = buckets.get(queue) or buckets["scan_standard"]
        if status == ScanStatus.PENDING:
            bucket.pending_jobs += 1
        elif status == ScanStatus.RUNNING:
            bucket.running_jobs += 1

    history_query = (
        db.query(ScanJob.status, Document.original_name, ScanJob.created_at, ScanJob.updated_at)
        .join(Document, ScanJob.document_id == Document.id)
        .filter(
            ScanJob.status.in_([ScanStatus.COMPLETED, ScanStatus.FAILED]),
            ScanJob.updated_at >= since,
        )
    )
    if tenant_id:
        history_query = history_query.filter(ScanJob.tenant_id == tenant_id)

    for status, original_name, created_at, updated_at in history_query.all():
        queue = tier_to_queue(classify_file_tier(original_name or ""))
        bucket = buckets.get(queue) or buckets["scan_standard"]
        if status == ScanStatus.COMPLETED:
            bucket.completed_window += 1
            if created_at and updated_at:
                duration = (updated_at - created_at).total_seconds()
                if duration >= 0:
                    bucket.duration_sum_seconds += duration
                    bucket.duration_count += 1
            if updated_at and (bucket.last_completed_at is None or updated_at > bucket.last_completed_at):
                bucket.last_completed_at = updated_at
        elif status == ScanStatus.FAILED:
            bucket.failed_window += 1

    items = []
    for queue_name in ["scan_light", "scan_standard", "scan_heavy"]:
        bucket = buckets[queue_name]
        avg = round(bucket.avg_processing_seconds, 2)
        eta = round(_estimate_wait_seconds(bucket.pending_jobs, bucket.avg_processing_seconds, slots[queue_name]), 2)
        items.append(
            {
                "queue_name": queue_name,
                "pending_jobs": bucket.pending_jobs,
                "running_jobs": bucket.running_jobs,
                "completed_window": bucket.completed_window,
                "failed_window": bucket.failed_window,
                "avg_processing_seconds": avg,
                "last_completed_at": bucket.last_completed_at,
                "estimated_wait_seconds": eta,
            }
        )

    total_pending = sum(item["pending_jobs"] for item in items)
    total_running = sum(item["running_jobs"] for item in items)
    total_eta = sum(item["estimated_wait_seconds"] for item in items)

    alerts: list[str] = []
    alert_level = "normal"

    if total_eta >= 900:
        alerts.append("High queue latency detected: estimated wait above 15 minutes.")
        alert_level = "critical"
    elif total_eta >= 300:
        alerts.append("Queue latency warning: estimated wait above 5 minutes.")
        alert_level = "warning"

    for item in items:
        completed = int(item["completed_window"])
        failed = int(item["failed_window"])
        if failed >= 5 and failed > completed * 0.2:
            alerts.append(f"Failure ratio elevated in {item['queue_name']}: {failed} failures in selected window.")
            if alert_level != "critical":
                alert_level = "warning"

    if tenant_id:
        plan = resolve_tenant_plan(db, tenant_id)
        policy = PLAN_POLICIES.get(plan)
        if policy:
            inflight = total_pending + total_running
            if total_pending >= policy.max_pending_jobs:
                alerts.append(f"Queue backlog limit reached for plan {plan}.")
                alert_level = "critical"
            elif total_pending >= int(policy.max_pending_jobs * 0.8):
                alerts.append(f"Queue backlog above 80% for plan {plan}.")
                if alert_level != "critical":
                    alert_level = "warning"

            if inflight >= policy.max_inflight_jobs:
                alerts.append(f"Concurrent inflight limit reached for plan {plan}.")
                alert_level = "critical"
            elif inflight >= int(policy.max_inflight_jobs * 0.8):
                alerts.append(f"Concurrent inflight usage above 80% for plan {plan}.")
                if alert_level != "critical":
                    alert_level = "warning"

    return {
        "generated_at": datetime.now(timezone.utc),
        "window_hours": window,
        "tenant_id": tenant_id,
        "total_pending": total_pending,
        "total_running": total_running,
        "eta_total_seconds": round(float(total_eta), 2),
        "alert_level": alert_level,
        "alerts": alerts,
        "items": items,
    }
