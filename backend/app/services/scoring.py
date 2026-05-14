from app.schemas.analysis import EvidenceItem


SEVERITY_WEIGHT = {
    "critical": 28,
    "high": 18,
    "medium": 10,
    "low": 4,
}


def compute_threat_score(evidences: list[EvidenceItem], llm_risk: str) -> float:
    score = sum(SEVERITY_WEIGHT.get(e.severity, 0) for e in evidences)
    score += {"low": 3, "medium": 10, "high": 22, "critical": 30}.get(llm_risk, 0)
    return float(min(100, score))


def risk_from_score(score: float) -> str:
    if score >= 85:
        return "critical"
    if score >= 65:
        return "high"
    if score >= 35:
        return "medium"
    return "low"

