from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.schemas.analysis import AnalysisResult
from app.services.document_parser import parse_document_bytes
from app.services.heuristics import run_heuristics
from app.services.llm_classifier import classify_hybrid
from app.services.ocr_service import extract_ocr_text
from app.services.sanitizer import sanitize_text
from app.services.scoring import compute_threat_score, risk_from_score


class AnalysisState(TypedDict, total=False):
    filename: str
    file_bytes: bytes
    extracted_text: str
    ocr_text: str
    combined_text: str
    sanitized_text: str
    hidden_segments: list[str]
    evidences: list[dict]
    suspicious_segments: list[str]
    exfiltration_indicators: list[str]
    llm_result: dict[str, Any]
    threat_score: float
    risk_level: str
    final_result: AnalysisResult


def sanitize_node(state: AnalysisState) -> AnalysisState:
    return {"filename": state["filename"], "file_bytes": state["file_bytes"]}


def extract_text_node(state: AnalysisState) -> AnalysisState:
    parsed = parse_document_bytes(state["filename"], state["file_bytes"])
    return {"extracted_text": parsed.text, "hidden_segments": parsed.hidden_segments}


def ocr_node(state: AnalysisState) -> AnalysisState:
    ocr_text = extract_ocr_text(state["filename"], state["file_bytes"])
    return {"ocr_text": ocr_text}


def combine_node(state: AnalysisState) -> AnalysisState:
    combined = "\n".join(filter(None, [state.get("extracted_text", ""), state.get("ocr_text", "")]))
    return {"combined_text": combined, "sanitized_text": sanitize_text(combined)}


def heuristic_node(state: AnalysisState) -> AnalysisState:
    evidences, suspicious_segments, exfiltration = run_heuristics(state.get("combined_text", ""), state.get("hidden_segments", []))
    return {
        "evidences": [item.model_dump() for item in evidences],
        "suspicious_segments": suspicious_segments,
        "exfiltration_indicators": exfiltration,
    }


def llm_node(state: AnalysisState) -> AnalysisState:
    from app.schemas.analysis import EvidenceItem

    evidence_models = [EvidenceItem(**item) for item in state.get("evidences", [])]
    llm_result = classify_hybrid(state.get("combined_text", ""), evidence_models)
    return {"llm_result": llm_result}


def scoring_node(state: AnalysisState) -> AnalysisState:
    from app.schemas.analysis import EvidenceItem

    evidence_models = [EvidenceItem(**item) for item in state.get("evidences", [])]
    threat_score = compute_threat_score(evidence_models, state.get("llm_result", {}).get("risk_level", "low"))
    risk_level = risk_from_score(threat_score)
    return {"threat_score": threat_score, "risk_level": risk_level}


def report_node(state: AnalysisState) -> AnalysisState:
    from app.schemas.analysis import EvidenceItem

    result = AnalysisResult(
        risk_level=state.get("risk_level", "low"),
        threat_score=state.get("threat_score", 0),
        content_classification=state.get("llm_result", {}).get("content_classification", "unknown"),
        technical_explanation=state.get("llm_result", {}).get("technical_explanation", "No technical explanation available."),
        evidences=[EvidenceItem(**item) for item in state.get("evidences", [])],
        suspicious_segments=state.get("suspicious_segments", []),
        sanitized_text_preview=state.get("sanitized_text", "")[:1200],
        exfiltration_indicators=state.get("exfiltration_indicators", []),
    )
    return {"final_result": result}


def build_pipeline():
    graph = StateGraph(AnalysisState)
    graph.add_node("sanitize", sanitize_node)
    graph.add_node("extract_text", extract_text_node)
    graph.add_node("ocr", ocr_node)
    graph.add_node("combine", combine_node)
    graph.add_node("heuristics", heuristic_node)
    graph.add_node("llm", llm_node)
    graph.add_node("score", scoring_node)
    graph.add_node("report", report_node)

    graph.set_entry_point("sanitize")
    graph.add_edge("sanitize", "extract_text")
    graph.add_edge("extract_text", "ocr")
    graph.add_edge("ocr", "combine")
    graph.add_edge("combine", "heuristics")
    graph.add_edge("heuristics", "llm")
    graph.add_edge("llm", "score")
    graph.add_edge("score", "report")
    graph.add_edge("report", END)

    return graph.compile()


PIPELINE = build_pipeline()


def analyze_document_bytes(filename: str, content: bytes) -> AnalysisResult:
    initial_state: AnalysisState = {"filename": filename, "file_bytes": content}
    output = PIPELINE.invoke(initial_state)
    return output["final_result"]

