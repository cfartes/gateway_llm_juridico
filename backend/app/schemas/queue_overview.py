from datetime import datetime

from pydantic import BaseModel, Field


class QueueBucketOut(BaseModel):
    queue_name: str
    pending_jobs: int = Field(ge=0)
    running_jobs: int = Field(ge=0)
    completed_window: int = Field(ge=0)
    failed_window: int = Field(ge=0)
    avg_processing_seconds: float = Field(ge=0)
    last_completed_at: datetime | None = None
    estimated_wait_seconds: float = Field(ge=0)


class QueueOverviewOut(BaseModel):
    generated_at: datetime
    window_hours: int = Field(ge=1, le=168)
    tenant_id: str | None = None
    total_pending: int = Field(ge=0)
    total_running: int = Field(ge=0)
    eta_total_seconds: float = Field(ge=0)
    alert_level: str = "normal"
    alerts: list[str] = Field(default_factory=list)
    items: list[QueueBucketOut]
