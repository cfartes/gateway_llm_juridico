from typing import Any

import httpx
from openai import OpenAI

from app.core.config import settings
from app.schemas.analysis import EvidenceItem


PROMPT_TEMPLATE = """
You are a security classifier specialized in LLM prompt injection.
Return JSON with keys: risk_level (low|medium|high|critical), content_classification, technical_explanation.
Context:\n{text}
"""


def classify_with_openai(text: str) -> dict[str, str] | None:
    if not settings.openai_api_key:
        return None
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model="gpt-4.1-mini",
            input=PROMPT_TEMPLATE.format(text=text[:6000]),
            response_format={"type": "json_object"},
        )
        raw = response.output_text
        import json

        return json.loads(raw)
    except Exception:
        return None


def classify_with_ollama(text: str) -> dict[str, str] | None:
    try:
        payload = {
            "model": settings.ollama_model,
            "prompt": PROMPT_TEMPLATE.format(text=text[:6000]),
            "stream": False,
            "format": "json",
        }
        with httpx.Client(base_url=settings.ollama_base_url, timeout=35.0) as client:
            resp = client.post("/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
            import json

            return json.loads(data.get("response", "{}"))
    except Exception:
        return None


def classify_hybrid(text: str, evidences: list[EvidenceItem], *, allow_llm: bool = True) -> dict[str, Any]:
    llm_result = None
    if allow_llm:
        llm_result = classify_with_openai(text) or classify_with_ollama(text)
    if llm_result:
        return llm_result

    critical_hits = sum(1 for e in evidences if e.severity == "critical")
    high_hits = sum(1 for e in evidences if e.severity == "high")
    if critical_hits > 0:
        risk = "critical"
    elif high_hits >= 2:
        risk = "high"
    elif high_hits == 1 or len(evidences) > 2:
        risk = "medium"
    else:
        risk = "low"

    return {
        "risk_level": risk,
        "content_classification": "suspicious_llm_payload" if evidences else "benign",
        "technical_explanation": "Hybrid fallback classification based on deterministic heuristics.",
    }

