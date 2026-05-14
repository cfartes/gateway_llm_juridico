from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class AnalyzeSourceType(StrEnum):
    FILE = "file"
    URL = "url"
    TEXT = "text"
    BASE64 = "base64"


class AnalyzeReturnMode(StrEnum):
    RISK_ONLY = "risk_only"
    FULL_REPORT = "full_report"
    RAG_MARKDOWN = "rag_markdown"


class AnalyzeRequest(BaseModel):
    source_type: AnalyzeSourceType
    return_mode: AnalyzeReturnMode = AnalyzeReturnMode.FULL_REPORT
    sanitize: bool = True
    generate_rag_md: bool = True
    tenant_id: str | None = None
    external_reference: str | None = None
    callback_url: HttpUrl | None = None
    callback_secret: str | None = Field(default=None, min_length=8, max_length=256)
    callback_auth_bearer: str | None = Field(default=None, min_length=8, max_length=2048)
    metadata: dict[str, Any] | None = None

    url: HttpUrl | None = None
    text: str | None = None
    base64_content: str | None = None
    filename: str | None = None


class ThreatItem(BaseModel):
    type: str
    severity: str
    evidence: str
    location: str
    explanation: str


class AnalyzeResultPayload(BaseModel):
    status: str = "completed"
    has_threat: bool
    risk_level: str
    risk_score: int
    threats: list[ThreatItem]
    safe_for_rag: bool
    recommendation: str

    content_classification: str | None = None
    technical_explanation: str | None = None
    suspicious_segments: list[str] | None = None
    exfiltration_indicators: list[str] | None = None

    rag_markdown: str | None = None
    rag_markdown_url: str | None = None
    chunks: list[dict[str, Any]] | None = None


class AnalyzeJobResponse(BaseModel):
    job_id: str
    file_id: str
    status: str
    created_at: datetime


class AnalyzeJobStatusResponse(BaseModel):
    job_id: str
    file_id: str
    status: str
    result: AnalyzeResultPayload | None = None
    error_message: str | None = None


class WebhookResultPayload(BaseModel):
    job_id: str
    file_id: str
    status: str
    result: AnalyzeResultPayload | None = None


class WebhookResultAck(BaseModel):
    ok: bool = True
    received_at: datetime = Field(default_factory=datetime.utcnow)
