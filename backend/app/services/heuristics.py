import re

from app.schemas.analysis import EvidenceItem


PATTERNS: list[tuple[str, str, str]] = [
    ("prompt_injection", "high", r"\bignore\s+(all|previous|above)\s+instructions?\b"),
    (
        "jailbreak",
        "high",
        r"\b(?:developer\s+mode|jailbreak|dan\s+mode|do\s+anything\s+now|ignore\s+safety\s+polic(?:y|ies))\b",
    ),
    (
        "exfiltration",
        "critical",
        r"\b(?:api[_ -]?key|access[_ -]?token|authorization:\s*bearer|private[_ -]?key|x-api-key)\b",
    ),
    ("data_leak", "critical", r"\b(?:send|post|upload|forward).{0,80}\b(?:https?://|webhook)\b"),
    ("social_engineering", "medium", r"\b(?:pretend to be|you are now|roleplay as)\b"),
    ("hidden_instruction", "high", r"\b(?:do not mention this instruction|invisible command|hidden instruction)\b"),
    ("context_manipulation", "medium", r"\b(?:override safety|bypass policy|disable guardrails)\b"),
    ("embedded_script", "high", r"<script\b|javascript:|onerror\s*="),
]


def run_heuristics(text: str, hidden_segments: list[str]) -> tuple[list[EvidenceItem], list[str], list[str]]:
    evidences: list[EvidenceItem] = []
    suspicious_segments: list[str] = []
    exfiltration_indicators: list[str] = []

    lowered = text.lower()
    for category, severity, pattern in PATTERNS:
        for match in re.finditer(pattern, lowered, flags=re.IGNORECASE):
            snippet = text[max(0, match.start() - 80): match.end() + 80].replace("\n", " ").strip()
            evidences.append(
                EvidenceItem(
                    category=category,
                    severity=severity,
                    snippet=snippet[:280],
                    explanation=f"Pattern '{pattern}' matched; possible {category} behavior.",
                )
            )
            suspicious_segments.append(snippet[:280])
            if category in {"exfiltration", "data_leak"}:
                exfiltration_indicators.append(snippet[:280])

    for segment in hidden_segments:
        evidences.append(
            EvidenceItem(
                category="hidden_text",
                severity="high",
                snippet=segment[:280],
                explanation="Hidden or low-visibility text detected in source document.",
            )
        )
        suspicious_segments.append(segment[:280])

    return evidences, suspicious_segments, exfiltration_indicators

