from datetime import datetime
from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    original_name: str
    mime_type: str
    extension: str
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}

