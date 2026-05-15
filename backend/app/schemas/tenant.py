from datetime import datetime
from pydantic import BaseModel, Field

from app.core.types import TenantPlan


class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    plan: TenantPlan
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantPlanUpdateRequest(BaseModel):
    plan: TenantPlan


class TenantQueuePolicyOut(BaseModel):
    plan: TenantPlan
    max_inflight_jobs: int
    max_pending_jobs: int
    burst_per_minute: int
    sync_requests_per_minute: int
    async_requests_per_minute: int
    url_requests_per_minute: int
    max_files_per_batch: int
    current_running_jobs: int
    current_pending_jobs: int
    current_inflight_jobs: int
    inflight_usage_percent: float
    pending_usage_percent: float
    upgrade_recommended: bool
    recommended_plan: TenantPlan | None = None
    upgrade_reasons: list[str] = Field(default_factory=list)

