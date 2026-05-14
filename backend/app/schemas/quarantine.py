from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from app.schemas.analysis import AnalysisResult


class QuarantineReviewAction(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class QuarantineReviewRequest(BaseModel):
    action: QuarantineReviewAction
    note: str | None = None
    generate_rag_md: bool = True


class QuarantineItem(BaseModel):
    scan_id: str
    file_id: str
    file_name: str
    policy_action: str | None
    policy_reason: str | None
    quarantine_status: str | None
    threat_score: float | None
    risk_level: str | None
    reviewed_by_user_id: str | None
    reviewed_at: datetime | None
    rag_markdown_available: bool
    created_at: datetime
    updated_at: datetime


class QuarantineDetail(QuarantineItem):
    result: AnalysisResult | None = None
    quarantine_note: str | None = None


class QuarantineReviewResponse(BaseModel):
    ok: bool = True
    item: QuarantineDetail
