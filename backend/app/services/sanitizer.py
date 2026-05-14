import re


def sanitize_text(text: str) -> str:
    sanitized = re.sub(r"(?i)(api[_ -]?key|token|password|secret)\s*[:=]\s*[^\s]+", "[REDACTED_SECRET]", text)
    sanitized = re.sub(r"\u200b|\u200c|\u200d|\ufeff", "", sanitized)
    sanitized = re.sub(r"[ \t]{2,}", " ", sanitized)
    return sanitized.strip()

