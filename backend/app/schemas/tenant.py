from datetime import datetime
from pydantic import BaseModel

from app.core.types import TenantPlan


class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    plan: TenantPlan
    created_at: datetime

    model_config = {"from_attributes": True}

