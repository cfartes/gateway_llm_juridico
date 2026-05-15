from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.queue_overview import QueueOverviewOut


class SLOIndicatorOut(BaseModel):
    name: str
    target: float
    actual: float
    unit: str
    status: str


class ActiveOpsAlertOut(BaseModel):
    scope_key: str
    indicator_name: str
    status: str
    actual: float
    target: float
    unit: str
    alert_count: int
    last_sent_at: datetime | None = None
    updated_at: datetime


class ScanOpsMetricsOut(BaseModel):
    total_jobs: int = Field(ge=0)
    completed_jobs: int = Field(ge=0)
    failed_jobs: int = Field(ge=0)
    pending_jobs: int = Field(ge=0)
    running_jobs: int = Field(ge=0)
    success_rate_percent: float = Field(ge=0, le=100)
    avg_processing_seconds: float = Field(ge=0)
    p95_processing_seconds: float = Field(ge=0)


class WebhookOpsMetricsOut(BaseModel):
    total_deliveries: int = Field(ge=0)
    delivered_count: int = Field(ge=0)
    dead_letter_count: int = Field(ge=0)
    discarded_count: int = Field(ge=0)
    delivery_success_rate_percent: float = Field(ge=0, le=100)


class UpgradeRequestOpsMetricsOut(BaseModel):
    pending_count: int = Field(ge=0)
    pending_over_sla_count: int = Field(ge=0)
    sla_hours: int = Field(ge=1)


class SupportTicketOpsMetricsOut(BaseModel):
    open_count: int = Field(ge=0)
    waiting_first_response_over_sla_count: int = Field(ge=0)
    first_response_sla_hours: int = Field(ge=1)


class OpsOverviewOut(BaseModel):
    generated_at: datetime
    window_hours: int = Field(ge=1, le=168)
    queue: QueueOverviewOut
    scans: ScanOpsMetricsOut
    webhooks: WebhookOpsMetricsOut
    upgrade_requests: UpgradeRequestOpsMetricsOut
    support_tickets: SupportTicketOpsMetricsOut
    slo: list[SLOIndicatorOut]
    active_alerts: list[ActiveOpsAlertOut] = Field(default_factory=list)


class OpsAlertEvaluationOut(BaseModel):
    scope_key: str
    window_hours: int
    updated_items: int
    breaches_sent: int
    recoveries_sent: int


class SLOHistoryPointOut(BaseModel):
    indicator_name: str
    status: str
    actual: float
    target: float
    unit: str
    recorded_at: datetime


class SLOHistoryResponseOut(BaseModel):
    scope_key: str
    window_hours: int
    limit_per_indicator: int
    items: list[SLOHistoryPointOut] = Field(default_factory=list)
