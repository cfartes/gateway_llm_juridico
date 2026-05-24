from pydantic import BaseModel, Field


class SecurityGateResult(BaseModel):
    safe_to_continue: bool
    policy_action: str
    policy_reason: str
    risk_level: str
    threat_score: float = Field(ge=0, le=100)
    evidence_count: int = Field(ge=0)


class DueDiligenceCriterion(BaseModel):
    criterion: str
    weight_percent: int
    status: str
    impact_points: float
    note: str


class DueDiligenceResponse(BaseModel):
    security_gate: SecurityGateResult
    cnpj: str | None = None
    cnpj_valid: bool = False
    score: float | None = Field(default=None, ge=0, le=100)
    recommendation: str | None = None
    criteria: list[DueDiligenceCriterion] = []
    summary: str


class BulkItemResult(BaseModel):
    cnpj: str
    valid: bool
    registration_status: str
    score: float | None = Field(default=None, ge=0, le=100)
    recommendation: str


class BulkDistribution(BaseModel):
    active: int = 0
    inactive: int = 0
    attention: int = 0
    recommended: int = 0
    desist: int = 0


class BulkUpdateResponse(BaseModel):
    security_gate: SecurityGateResult
    total_extracted: int = 0
    total_valid: int = 0
    total_invalid: int = 0
    average_score: float | None = Field(default=None, ge=0, le=100)
    distribution: BulkDistribution
    items: list[BulkItemResult] = []
    summary: str


class InvoiceValidationResponse(BaseModel):
    security_gate: SecurityGateResult
    access_key: str | None = None
    access_key_valid: bool = False
    emitter_cnpj: str | None = None
    emitter_cnpj_valid: bool = False
    sefaz_status: str
    recommendation: str
    summary: str


class CNPJLookupResponse(BaseModel):
    cnpj: str
    cnpj_valid: bool
    score: float | None = Field(default=None, ge=0, le=100)
    recommendation: str | None = None
    registration_status: str | None = None
    criteria: list[DueDiligenceCriterion] = []
    summary: str
