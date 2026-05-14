from datetime import datetime
from pydantic import BaseModel


class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

