from __future__ import annotations

from dataclasses import dataclass

from app.core.types import QuarantineStatus
from app.core.config import settings
from app.schemas.analysis import AnalysisResult


@dataclass
class PreLLMDecision:
    should_call_llm: bool
    reason: str
    mode: str


@dataclass
class PolicyDecision:
    action: str
    reason: str
    safe_for_rag: bool


def quarantine_status_from_action(action: str) -> str:
    normalized = str(action).lower()
    if normalized == "allow":
        return str(QuarantineStatus.NOT_REQUIRED)
    if normalized == "quarantine":
        return str(QuarantineStatus.PENDING_REVIEW)
    return str(QuarantineStatus.REJECTED)


def decide_pre_llm_from_heuristics(evidences: list[dict]) -> PreLLMDecision:
    critical_hits = 0
    high_hits = 0
    for item in evidences:
        severity = str(item.get("severity", "")).lower()
        if severity == "critical":
            critical_hits += 1
        elif severity == "high":
            high_hits += 1

    if critical_hits > 0:
        return PreLLMDecision(
            should_call_llm=False,
            reason="Critical heuristic evidence detected; LLM step skipped for safety.",
            mode="heuristics-only",
        )

    if high_hits >= settings.policy_llm_skip_high_hits_threshold:
        return PreLLMDecision(
            should_call_llm=False,
            reason="Multiple high-severity heuristic evidences detected; LLM step skipped for safety.",
            mode="heuristics-only",
        )

    return PreLLMDecision(should_call_llm=True, reason="No blocking heuristic pattern for LLM stage.", mode="hybrid-llm")


def decide_policy_action(result: AnalysisResult) -> PolicyDecision:
    risk_level = str(result.risk_level).lower()
    critical_or_high_evidence = any(str(ev.severity).lower() in {"critical", "high"} for ev in result.evidences)

    if result.exfiltration_indicators:
        return PolicyDecision(
            action="block",
            reason="Exfiltration indicators detected. Content blocked from downstream LLM/RAG ingestion.",
            safe_for_rag=False,
        )

    if risk_level == "critical" or result.threat_score >= settings.policy_block_score_threshold:
        return PolicyDecision(
            action="block",
            reason="Threat score/risk level exceeded block policy threshold.",
            safe_for_rag=False,
        )

    if risk_level == "high" or result.threat_score >= settings.policy_quarantine_score_threshold or critical_or_high_evidence:
        return PolicyDecision(
            action="quarantine",
            reason="Document moved to quarantine due to high-risk indicators pending manual review.",
            safe_for_rag=False,
        )

    return PolicyDecision(
        action="allow",
        reason="No blocking indicators found. Document allowed for sanitized RAG workflow.",
        safe_for_rag=True,
    )
