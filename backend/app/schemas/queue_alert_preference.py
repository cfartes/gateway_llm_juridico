from datetime import datetime

from pydantic import BaseModel, Field


class QueueAlertPreferenceOut(BaseModel):
    scope: str
    scope_key: str
    snooze_until: datetime | None = None
    acknowledged_signature: str | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class QueueAlertPreferenceUpdateRequest(BaseModel):
    snooze_minutes: int | None = Field(default=None, ge=1, le=1440)
    clear_snooze: bool = False
    acknowledged_signature: str | None = Field(default=None, max_length=4096)
