from datetime import datetime

from pydantic import BaseModel, Field


class SupportTicketCreateRequest(BaseModel):
    subject: str = Field(min_length=4, max_length=200)
    category: str = Field(default="general", max_length=64)
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    description: str = Field(min_length=10, max_length=12000)


class SupportTicketStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(open|in_progress|resolved|closed)$")
    admin_note: str | None = Field(default=None, max_length=4000)
    assigned_to_user_id: str | None = None


class SupportTicketOut(BaseModel):
    id: str
    tenant_id: str
    requester_user_id: str | None = None
    subject: str
    category: str
    priority: str
    status: str
    description: str
    admin_note: str | None = None
    assigned_to_user_id: str | None = None
    first_response_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SupportTicketMessageCreateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    is_internal: bool = False


class SupportTicketMessageOut(BaseModel):
    id: str
    ticket_id: str
    tenant_id: str
    author_user_id: str | None = None
    author_role: str
    message: str
    is_internal: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SupportTicketAttachmentOut(BaseModel):
    id: str
    ticket_id: str
    tenant_id: str
    message_id: str | None = None
    uploaded_by_user_id: str | None = None
    uploaded_by_role: str
    original_name: str
    mime_type: str
    size_bytes: int
    sha256: str
    is_internal: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
