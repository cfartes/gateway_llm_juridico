import re

from app.schemas.analysis import EvidenceItem


PATTERNS: list[tuple[str, str, str]] = [
    ("prompt_injection", "high", r"ignore (all|previous|above) instructions"),
    ("jailbreak", "high", r"developer mode|jailbreak|DAN"),
    ("exfiltration", "critical", r"api[_ -]?key|access[_ -]?token|secret|credentials"),
    ("data_leak", "critical", r"send .* to (http|https)://|webhook"),
    ("social_engineering", "medium", r"pretend to be|you are now|roleplay as"),
    ("hidden_instruction", "high", r"do not mention this instruction|invisible command"),
    ("context_manipulation", "medium", r"override safety|bypass policy|disable guardrails"),
    ("embedded_script", "high", r"<script|javascript:|onerror="),
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

