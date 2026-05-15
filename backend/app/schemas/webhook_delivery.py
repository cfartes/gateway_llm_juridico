from datetime import datetime

from pydantic import BaseModel, Field


class WebhookDeliveryAttemptOut(BaseModel):
    id: str
    attempt_number: int
    http_status: int | None
    error_message: str | None
    response_preview: str | None
    duration_ms: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WebhookDeliveryOut(BaseModel):
    id: str
    tenant_id: str
    scan_job_id: str | None
    document_id: str | None
    callback_url: str
    status: str
    attempt_count: int
    max_attempts: int
    last_http_status: int | None
    last_error: str | None
    last_response_preview: str | None
    last_attempt_at: datetime | None
    next_retry_at: datetime | None
    delivered_at: datetime | None
    discarded_at: datetime | None
    alert_last_sent_at: datetime | None
    alert_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WebhookDeliveryDetailOut(BaseModel):
    delivery: WebhookDeliveryOut
    attempts: list[WebhookDeliveryAttemptOut]


class WebhookDeliveryListResponse(BaseModel):
    items: list[WebhookDeliveryOut]
    total: int
    total_dead_letter: int
    total_delivered: int
    total_discarded: int


class WebhookDeliveryRetryResponse(BaseModel):
    delivery: WebhookDeliveryOut
    retried_attempts: int = Field(ge=0)


class WebhookCallbackFailureOut(BaseModel):
    callback_url: str
    dead_letter_count: int


class WebhookTenantFailureOut(BaseModel):
    tenant_id: str
    dead_letter_count: int


class WebhookDeliveryMetricsOut(BaseModel):
    window_days: int
    total_events: int
    delivered_events: int
    dead_letter_events: int
    discarded_events: int
    success_rate_percent: float
    avg_attempts_per_event: float
    avg_attempt_duration_ms: float
    top_failed_callbacks: list[WebhookCallbackFailureOut]
    top_failed_tenants: list[WebhookTenantFailureOut]


class WebhookDeadLetterRunResponse(BaseModel):
    queued: bool
    task_id: str
