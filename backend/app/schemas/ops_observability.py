from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.queue_overview import QueueOverviewOut


class SLOIndicatorOut(BaseModel):
    name: str
    target: float
    actual: float
    unit: str
    status: str


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


class OpsOverviewOut(BaseModel):
    generated_at: datetime
    window_hours: int = Field(ge=1, le=168)
    queue: QueueOverviewOut
    scans: ScanOpsMetricsOut
    webhooks: WebhookOpsMetricsOut
    slo: list[SLOIndicatorOut]

