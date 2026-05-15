from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.scan_job import ScanJob
from app.models.webhook_delivery import WebhookDelivery
from app.schemas.webhook_delivery import (
    WebhookDeliveryDetailOut,
    WebhookDeliveryListResponse,
    WebhookDeliveryOut,
    WebhookDeliveryRetryResponse,
)
from app.services.audit_service import write_audit_log
from app.services.webhook_delivery_service import list_deliveries_with_stats, retry_delivery_now


router = APIRouter(prefix="/admin/webhooks/deliveries", tags=["superadmin-webhooks"])


@router.get("", response_model=WebhookDeliveryListResponse)
def list_webhook_deliveries(
    status: str = Query(default="dead_letter"),
    tenant_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    items, counts = list_deliveries_with_stats(db, status=status, tenant_id=tenant_id, limit=limit)
    return WebhookDeliveryListResponse(
        items=[WebhookDeliveryOut.model_validate(item) for item in items],
        total=len(items),
        total_dead_letter=counts.get("dead_letter", 0),
        total_delivered=counts.get("delivered", 0),
        total_discarded=counts.get("discarded", 0),
    )


@router.get("/{delivery_id}", response_model=WebhookDeliveryDetailOut)
def get_webhook_delivery(
    delivery_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Webhook delivery not found")

    attempts = sorted(delivery.attempts, key=lambda item: item.attempt_number, reverse=True)
    return WebhookDeliveryDetailOut(
        delivery=WebhookDeliveryOut.model_validate(delivery),
        attempts=attempts,
    )


@router.post("/{delivery_id}/retry", response_model=WebhookDeliveryRetryResponse)
def retry_webhook_delivery(
    delivery_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Webhook delivery not found")
    if delivery.status == "discarded":
        raise HTTPException(status_code=409, detail="Discarded delivery cannot be retried")

    try:
        updated, attempts = retry_delivery_now(
            db,
            delivery=delivery,
            timeout_seconds=settings.webhook_callback_timeout_seconds,
            max_retries=settings.webhook_callback_max_retries,
            base_backoff_seconds=settings.webhook_callback_backoff_seconds,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retry failed: {exc}") from exc

    if updated.status == "delivered" and updated.scan_job_id:
        scan = db.query(ScanJob).filter(ScanJob.id == updated.scan_job_id).first()
        if scan and scan.error_message and "Webhook callback delivery failed" in scan.error_message:
            scan.error_message = None
            db.add(scan)
            db.commit()

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.webhook.retry",
        resource_type="webhook_delivery",
        resource_id=updated.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"target_tenant_id": updated.tenant_id, "retried_attempts": attempts},
    )

    return WebhookDeliveryRetryResponse(
        delivery=WebhookDeliveryOut.model_validate(updated),
        retried_attempts=attempts,
    )


@router.post("/{delivery_id}/discard", response_model=WebhookDeliveryOut)
def discard_webhook_delivery(
    delivery_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Webhook delivery not found")

    delivery.status = "discarded"
    delivery.discarded_at = datetime.now(timezone.utc)
    db.add(delivery)
    db.commit()
    db.refresh(delivery)

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.webhook.discard",
        resource_type="webhook_delivery",
        resource_id=delivery.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"target_tenant_id": delivery.tenant_id},
    )

    return WebhookDeliveryOut.model_validate(delivery)
