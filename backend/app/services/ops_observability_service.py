from datetime import datetime, timedelta, timezone
from typing import Sequence

from sqlalchemy.orm import Session

from app.core.types import ScanStatus
from app.models.scan_job import ScanJob
from app.models.webhook_delivery import WebhookDelivery
from app.services.queue_observability_service import build_queue_overview


def _percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    k = (len(sorted_values) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return float(sorted_values[f])
    d0 = sorted_values[f] * (c - k)
    d1 = sorted_values[c] * (k - f)
    return float(d0 + d1)


def _slo_status(*, higher_is_better: bool, actual: float, target: float) -> str:
    if higher_is_better:
        if actual >= target:
            return "pass"
        if actual >= target * 0.95:
            return "warn"
        return "fail"
    if actual <= target:
        return "pass"
    if actual <= target * 1.25:
        return "warn"
    return "fail"


def build_ops_overview(db: Session, *, window_hours: int = 24, tenant_id: str | None = None) -> dict:
    window = max(1, min(window_hours, 168))
    since = datetime.now(timezone.utc) - timedelta(hours=window)

    queue = build_queue_overview(db, tenant_id=tenant_id, window_hours=window)

    scan_query = db.query(ScanJob).filter(ScanJob.created_at >= since)
    if tenant_id:
        scan_query = scan_query.filter(ScanJob.tenant_id == tenant_id)
    scans = scan_query.all()

    completed = [item for item in scans if item.status == ScanStatus.COMPLETED]
    failed = [item for item in scans if item.status == ScanStatus.FAILED]
    pending = [item for item in scans if item.status == ScanStatus.PENDING]
    running = [item for item in scans if item.status == ScanStatus.RUNNING]
    finalized = len(completed) + len(failed)
    success_rate = (len(completed) / finalized * 100.0) if finalized > 0 else 100.0

    durations: list[float] = []
    for item in completed:
        if item.created_at and item.updated_at:
            delta = (item.updated_at - item.created_at).total_seconds()
            if delta >= 0:
                durations.append(delta)
    avg_processing = (sum(durations) / len(durations)) if durations else 0.0
    p95_processing = _percentile(durations, 0.95)

    webhook_query = db.query(WebhookDelivery).filter(WebhookDelivery.created_at >= since)
    if tenant_id:
        webhook_query = webhook_query.filter(WebhookDelivery.tenant_id == tenant_id)
    deliveries = webhook_query.all()
    delivered_count = sum(1 for item in deliveries if item.status == "delivered")
    dead_letter_count = sum(1 for item in deliveries if item.status == "dead_letter")
    discarded_count = sum(1 for item in deliveries if item.status == "discarded")
    webhook_success_rate = (delivered_count / len(deliveries) * 100.0) if deliveries else 100.0

    scan_slo_target = 99.0
    scan_latency_target = 120.0
    webhook_slo_target = 99.0
    queue_eta_target = 300.0

    slo = [
        {
            "name": "scan_success_rate",
            "target": scan_slo_target,
            "actual": round(success_rate, 2),
            "unit": "percent",
            "status": _slo_status(higher_is_better=True, actual=success_rate, target=scan_slo_target),
        },
        {
            "name": "scan_p95_latency",
            "target": scan_latency_target,
            "actual": round(p95_processing, 2),
            "unit": "seconds",
            "status": _slo_status(higher_is_better=False, actual=p95_processing, target=scan_latency_target),
        },
        {
            "name": "webhook_delivery_success_rate",
            "target": webhook_slo_target,
            "actual": round(webhook_success_rate, 2),
            "unit": "percent",
            "status": _slo_status(higher_is_better=True, actual=webhook_success_rate, target=webhook_slo_target),
        },
        {
            "name": "queue_total_eta",
            "target": queue_eta_target,
            "actual": float(queue.get("eta_total_seconds", 0.0)),
            "unit": "seconds",
            "status": _slo_status(
                higher_is_better=False,
                actual=float(queue.get("eta_total_seconds", 0.0)),
                target=queue_eta_target,
            ),
        },
    ]

    return {
        "generated_at": datetime.now(timezone.utc),
        "window_hours": window,
        "queue": queue,
        "scans": {
            "total_jobs": len(scans),
            "completed_jobs": len(completed),
            "failed_jobs": len(failed),
            "pending_jobs": len(pending),
            "running_jobs": len(running),
            "success_rate_percent": round(success_rate, 2),
            "avg_processing_seconds": round(avg_processing, 2),
            "p95_processing_seconds": round(p95_processing, 2),
        },
        "webhooks": {
            "total_deliveries": len(deliveries),
            "delivered_count": delivered_count,
            "dead_letter_count": dead_letter_count,
            "discarded_count": discarded_count,
            "delivery_success_rate_percent": round(webhook_success_rate, 2),
        },
        "slo": slo,
    }

