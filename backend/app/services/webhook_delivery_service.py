import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.scan_job import ScanJob
from app.models.webhook_delivery import WebhookDelivery, WebhookDeliveryAttempt
from app.utils.crypto import decrypt_text, encrypt_text


def _decode_optional(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return decrypt_text(value)
    except Exception:
        return value


def persist_webhook_delivery_result(
    db: Session,
    *,
    scan_job: ScanJob,
    callback_url: str,
    payload: dict[str, Any],
    callback_secret: str | None,
    callback_auth_bearer: str | None,
    max_attempts: int,
    delivery_result: dict[str, Any],
) -> WebhookDelivery:
    now = datetime.now(timezone.utc)
    logs = delivery_result.get("attempt_logs", []) or []
    ok = bool(delivery_result.get("ok"))

    delivery = WebhookDelivery(
        tenant_id=scan_job.tenant_id,
        scan_job_id=scan_job.id,
        document_id=scan_job.document_id,
        callback_url=callback_url,
        status="delivered" if ok else "dead_letter",
        attempt_count=len(logs),
        max_attempts=max_attempts,
        last_http_status=delivery_result.get("status_code"),
        last_error=delivery_result.get("error"),
        last_response_preview=delivery_result.get("response_preview"),
        payload_json=encrypt_text(json.dumps(payload, ensure_ascii=False)),
        callback_secret_enc=encrypt_text(callback_secret) if callback_secret else None,
        callback_auth_bearer_enc=encrypt_text(callback_auth_bearer) if callback_auth_bearer else None,
        last_attempt_at=now if logs else None,
        delivered_at=now if ok else None,
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)

    for idx, item in enumerate(logs, start=1):
        attempt = WebhookDeliveryAttempt(
            delivery_id=delivery.id,
            attempt_number=idx,
            http_status=item.get("status_code"),
            error_message=item.get("error"),
            response_preview=item.get("response_preview"),
            duration_ms=item.get("duration_ms"),
        )
        db.add(attempt)
    db.commit()

    return delivery


def list_deliveries_with_stats(
    db: Session,
    *,
    status: str = "dead_letter",
    tenant_id: str | None = None,
    limit: int = 100,
) -> tuple[list[WebhookDelivery], dict[str, int]]:
    limit = max(1, min(limit, 500))
    query = db.query(WebhookDelivery)
    if tenant_id:
        query = query.filter(WebhookDelivery.tenant_id == tenant_id)
    if status != "all":
        query = query.filter(WebhookDelivery.status == status)

    items = query.order_by(WebhookDelivery.updated_at.desc()).limit(limit).all()

    count_query = db.query(WebhookDelivery.status, func.count(WebhookDelivery.id))
    if tenant_id:
        count_query = count_query.filter(WebhookDelivery.tenant_id == tenant_id)
    counts = {str(row[0]): int(row[1]) for row in count_query.group_by(WebhookDelivery.status).all()}

    return items, counts


def retry_delivery_now(
    db: Session,
    *,
    delivery: WebhookDelivery,
    timeout_seconds: float,
    max_retries: int,
    base_backoff_seconds: float,
) -> tuple[WebhookDelivery, int]:
    from app.services.analyze_gateway_service import trigger_result_webhook

    payload_raw = _decode_optional(delivery.payload_json)
    if not payload_raw:
        raise ValueError("Stored webhook payload is empty")
    payload = json.loads(payload_raw)

    callback_secret = _decode_optional(delivery.callback_secret_enc)
    callback_auth_bearer = _decode_optional(delivery.callback_auth_bearer_enc)

    result = trigger_result_webhook(
        delivery.callback_url,
        payload,
        callback_secret=callback_secret,
        callback_auth_bearer=callback_auth_bearer,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        base_backoff_seconds=base_backoff_seconds,
    )

    logs = result.get("attempt_logs", []) or []
    start_number = delivery.attempt_count + 1
    for offset, item in enumerate(logs):
        attempt = WebhookDeliveryAttempt(
            delivery_id=delivery.id,
            attempt_number=start_number + offset,
            http_status=item.get("status_code"),
            error_message=item.get("error"),
            response_preview=item.get("response_preview"),
            duration_ms=item.get("duration_ms"),
        )
        db.add(attempt)

    delivery.attempt_count += len(logs)
    delivery.last_http_status = result.get("status_code")
    delivery.last_error = result.get("error")
    delivery.last_response_preview = result.get("response_preview")
    delivery.last_attempt_at = datetime.now(timezone.utc) if logs else delivery.last_attempt_at
    delivery.discarded_at = None
    if result.get("ok"):
        delivery.status = "delivered"
        delivery.delivered_at = datetime.now(timezone.utc)
    else:
        delivery.status = "dead_letter"
        delivery.delivered_at = None

    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    return delivery, len(logs)


def compute_delivery_metrics(
    db: Session,
    *,
    window_days: int = 7,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    bounded_days = max(1, min(window_days, 90))
    since = datetime.now(timezone.utc) - timedelta(days=bounded_days)

    base_query = db.query(WebhookDelivery).filter(WebhookDelivery.created_at >= since)
    if tenant_id:
        base_query = base_query.filter(WebhookDelivery.tenant_id == tenant_id)

    total_events = int(base_query.count())
    delivered_events = int(base_query.filter(WebhookDelivery.status == "delivered").count())
    dead_letter_events = int(base_query.filter(WebhookDelivery.status == "dead_letter").count())
    discarded_events = int(base_query.filter(WebhookDelivery.status == "discarded").count())

    avg_attempts = (
        base_query.with_entities(func.avg(WebhookDelivery.attempt_count)).scalar()
        or 0.0
    )

    attempts_query = (
        db.query(func.avg(WebhookDeliveryAttempt.duration_ms))
        .join(WebhookDelivery, WebhookDeliveryAttempt.delivery_id == WebhookDelivery.id)
        .filter(WebhookDelivery.created_at >= since)
    )
    if tenant_id:
        attempts_query = attempts_query.filter(WebhookDelivery.tenant_id == tenant_id)
    avg_attempt_duration = attempts_query.scalar() or 0.0

    callback_failures_query = (
        db.query(WebhookDelivery.callback_url, func.count(WebhookDelivery.id))
        .filter(WebhookDelivery.created_at >= since, WebhookDelivery.status == "dead_letter")
    )
    if tenant_id:
        callback_failures_query = callback_failures_query.filter(WebhookDelivery.tenant_id == tenant_id)
    top_failed_callbacks = [
        {"callback_url": row[0], "dead_letter_count": int(row[1])}
        for row in (
            callback_failures_query.group_by(WebhookDelivery.callback_url)
            .order_by(func.count(WebhookDelivery.id).desc())
            .limit(5)
            .all()
        )
    ]

    tenant_failures_query = (
        db.query(WebhookDelivery.tenant_id, func.count(WebhookDelivery.id))
        .filter(WebhookDelivery.created_at >= since, WebhookDelivery.status == "dead_letter")
    )
    if tenant_id:
        tenant_failures_query = tenant_failures_query.filter(WebhookDelivery.tenant_id == tenant_id)
    top_failed_tenants = [
        {"tenant_id": row[0], "dead_letter_count": int(row[1])}
        for row in (
            tenant_failures_query.group_by(WebhookDelivery.tenant_id)
            .order_by(func.count(WebhookDelivery.id).desc())
            .limit(5)
            .all()
        )
    ]

    settled_total = delivered_events + dead_letter_events
    success_rate = (delivered_events / settled_total * 100.0) if settled_total > 0 else 0.0

    return {
        "window_days": bounded_days,
        "total_events": total_events,
        "delivered_events": delivered_events,
        "dead_letter_events": dead_letter_events,
        "discarded_events": discarded_events,
        "success_rate_percent": round(float(success_rate), 2),
        "avg_attempts_per_event": round(float(avg_attempts), 2),
        "avg_attempt_duration_ms": round(float(avg_attempt_duration), 2),
        "top_failed_callbacks": top_failed_callbacks,
        "top_failed_tenants": top_failed_tenants,
    }
