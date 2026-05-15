from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.models.webhook_delivery import WebhookDelivery
from app.schemas.webhook_delivery import (
    WebhookDeliveryDetailOut,
    WebhookDeliveryListResponse,
    WebhookDeliveryOut,
    WebhookDeliveryRetryResponse,
)
from app.services.webhook_delivery_service import list_deliveries_with_stats, retry_delivery_now


router = APIRouter(prefix="/webhooks/deliveries", tags=["webhook-deliveries"])


@router.get("", response_model=WebhookDeliveryListResponse)
def list_tenant_webhook_deliveries(
    status: str = Query(default="all"),
    limit: int = Query(default=100, ge=1, le=500),
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    items, counts = list_deliveries_with_stats(db, status=status, tenant_id=auth.tenant_id, limit=limit)
    return WebhookDeliveryListResponse(
        items=[WebhookDeliveryOut.model_validate(item) for item in items],
        total=len(items),
        total_dead_letter=counts.get("dead_letter", 0),
        total_delivered=counts.get("delivered", 0),
        total_discarded=counts.get("discarded", 0),
    )


@router.get("/{delivery_id}", response_model=WebhookDeliveryDetailOut)
def get_tenant_webhook_delivery(
    delivery_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    delivery = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.id == delivery_id, WebhookDelivery.tenant_id == auth.tenant_id)
        .first()
    )
    if not delivery:
        raise HTTPException(status_code=404, detail="Webhook delivery not found")
    attempts = sorted(delivery.attempts, key=lambda item: item.attempt_number, reverse=True)
    return WebhookDeliveryDetailOut(delivery=WebhookDeliveryOut.model_validate(delivery), attempts=attempts)


@router.post("/{delivery_id}/retry", response_model=WebhookDeliveryRetryResponse)
def retry_tenant_webhook_delivery(
    delivery_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    delivery = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.id == delivery_id, WebhookDelivery.tenant_id == auth.tenant_id)
        .first()
    )
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

    return WebhookDeliveryRetryResponse(delivery=WebhookDeliveryOut.model_validate(updated), retried_attempts=attempts)
