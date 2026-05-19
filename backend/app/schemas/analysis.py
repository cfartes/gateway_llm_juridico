from datetime import datetime
from pydantic import BaseModel, Field

from app.core.types import ScanStatus
from app.schemas.document import DocumentOut


class EvidenceItem(BaseModel):
    category: str
    severity: str
    snippet: str
    explanation: str


class AnalysisResult(BaseModel):
    risk_level: str
    threat_score: float = Field(ge=0, le=100)
    content_classification: str
    technical_explanation: str
    evidences: list[EvidenceItem]
    suspicious_segments: list[str]
    sanitized_text_preview: str
    sanitized_text_full: str | None = None
    exfiltration_indicators: list[str]


class ScanJobOut(BaseModel):
    id: str
    status: ScanStatus
    threat_score: float | None
    risk_level: str | None
    summary: str | None
    policy_action: str | None = None
    policy_reason: str | None = None
    quarantine_status: str | None = None
    quarantine_note: str | None = None
    reviewed_by_user_id: str | None = None
    reviewed_at: datetime | None = None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScanResponse(BaseModel):
    document: DocumentOut
    scan: ScanJobOut
    result: AnalysisResult | None

