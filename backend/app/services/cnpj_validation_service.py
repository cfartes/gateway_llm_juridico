from __future__ import annotations

import hashlib
import re

from app.schemas.analysis import AnalysisResult
from app.schemas.cnpj_validation import (
    BulkDistribution,
    BulkItemResult,
    DueDiligenceCriterion,
    SecurityGateResult,
)
from app.services.br_data_provider_service import fetch_cnpj_signals, fetch_nfe_status
from app.services.policy_enforcement import decide_policy_action
from app.utils.br_docs import is_valid_cnpj, only_digits


CNPJ_REGEX = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
NFE_ACCESS_KEY_REGEX = re.compile(r"(?<!\d)(\d{44})(?!\d)")


def build_security_gate(result: AnalysisResult) -> SecurityGateResult:
    policy = decide_policy_action(result)
    return SecurityGateResult(
        safe_to_continue=policy.safe_for_rag,
        policy_action=policy.action,
        policy_reason=policy.reason,
        risk_level=result.risk_level,
        threat_score=result.threat_score,
        evidence_count=len(result.evidences),
    )


def extract_document_text(filename: str, content: bytes) -> str:
    from app.services.document_parser import parse_document_bytes
    from app.services.ocr_service import extract_ocr_text

    parsed = parse_document_bytes(filename, content)
    ocr_text = extract_ocr_text(filename, content)
    return "\n".join(part for part in [parsed.text, ocr_text] if part).strip()


def extract_cnpjs(text: str) -> list[str]:
    found = [only_digits(match.group(0)) for match in CNPJ_REGEX.finditer(text)]
    unique: list[str] = []
    for candidate in found:
        if candidate and candidate not in unique:
            unique.append(candidate)
    return unique


def extract_first_cnpj(text: str) -> str | None:
    all_cnpjs = extract_cnpjs(text)
    return all_cnpjs[0] if all_cnpjs else None


def _simulate_signal(cnpj: str, salt: str) -> int:
    digest = hashlib.sha256(f"{cnpj}:{salt}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _registration_status(cnpj: str) -> str:
    bucket = _simulate_signal(cnpj, "rfb")
    if bucket < 72:
        return "active"
    if bucket < 86:
        return "suspended"
    return "inactive"


def _debt_signal(cnpj: str) -> str:
    bucket = _simulate_signal(cnpj, "debt")
    if bucket < 55:
        return "none"
    if bucket < 85:
        return "moderate"
    return "high"


def _lawsuit_signal(cnpj: str) -> str:
    bucket = _simulate_signal(cnpj, "lawsuit")
    if bucket < 45:
        return "below_average"
    if bucket < 80:
        return "average"
    return "above_average"


def _sintegra_signal(cnpj: str) -> bool:
    return _simulate_signal(cnpj, "sintegra") < 80


def _recommendation(score: float, registration_status: str) -> str:
    if registration_status != "active":
        return "Desistir do Contrato"
    if score >= 80:
        return "Recomendado para Assinatura"
    if score >= 50:
        return "Atencao: Requer Analise Humana"
    return "Desistir do Contrato"


def evaluate_cnpj_due_diligence(cnpj: str) -> tuple[float, list[DueDiligenceCriterion], str, str]:
    provider_signals = fetch_cnpj_signals(cnpj)
    registration_status = provider_signals.registration_status or _registration_status(cnpj)
    debt = provider_signals.debt_level or _debt_signal(cnpj)
    lawsuits = provider_signals.lawsuit_level or _lawsuit_signal(cnpj)
    sintegra_ok = (
        provider_signals.sintegra_enabled
        if provider_signals.sintegra_enabled is not None
        else _sintegra_signal(cnpj)
    )

    if registration_status == "active":
        registration_points = 40.0
        registration_note = "Situacao cadastral regular na RFB."
    elif registration_status == "suspended":
        registration_points = 12.0
        registration_note = "Situacao cadastral com restricoes. Exige confirmacao manual."
    else:
        registration_points = 0.0
        registration_note = "Situacao cadastral irregular (inativa/baixada)."

    debt_points = {"none": 20.0, "moderate": 12.0, "high": 4.0}[debt]
    debt_note = {
        "none": "Sem indicio de divida ativa relevante.",
        "moderate": "Possui debitos moderados.",
        "high": "Volume alto de debitos em aberto.",
    }[debt]

    lawsuits_points = {"below_average": 20.0, "average": 14.0, "above_average": 6.0}[lawsuits]
    lawsuits_note = {
        "below_average": "Volume de processos abaixo da media setorial.",
        "average": "Volume de processos dentro da media setorial.",
        "above_average": "Volume de processos acima da media setorial.",
    }[lawsuits]

    sintegra_points = 20.0 if sintegra_ok else 0.0
    sintegra_note = (
        "Inscricao estadual apta para operacoes de fornecimento."
        if sintegra_ok
        else "Inscricao estadual nao habilitada para operacoes de fornecimento."
    )

    if provider_signals.source != "mock":
        registration_note = f"{registration_note} Fonte: {provider_signals.source}."
        debt_note = f"{debt_note} Fonte: {provider_signals.source}."
        lawsuits_note = f"{lawsuits_note} Fonte: {provider_signals.source}."
        sintegra_note = f"{sintegra_note} Fonte: {provider_signals.source}."

    score = registration_points + debt_points + lawsuits_points + sintegra_points
    score = max(0.0, min(100.0, round(score, 2)))
    recommendation = _recommendation(score, registration_status)

    criteria = [
        DueDiligenceCriterion(
            criterion="Situacao Cadastral na RFB",
            weight_percent=40,
            status=registration_status,
            impact_points=registration_points,
            note=registration_note,
        ),
        DueDiligenceCriterion(
            criterion="Divida Ativa da Uniao",
            weight_percent=20,
            status=debt,
            impact_points=debt_points,
            note=debt_note,
        ),
        DueDiligenceCriterion(
            criterion="Processos Judiciais",
            weight_percent=20,
            status=lawsuits,
            impact_points=lawsuits_points,
            note=lawsuits_note,
        ),
        DueDiligenceCriterion(
            criterion="Sintegra (Inscricao Estadual)",
            weight_percent=20,
            status="enabled" if sintegra_ok else "disabled",
            impact_points=sintegra_points,
            note=sintegra_note,
        ),
    ]
    return score, criteria, recommendation, registration_status


def evaluate_bulk_cnpjs(cnpjs: list[str]) -> tuple[list[BulkItemResult], BulkDistribution, float | None]:
    items: list[BulkItemResult] = []
    distribution = BulkDistribution()
    score_acc = 0.0
    score_count = 0

    for cnpj in cnpjs:
        normalized = only_digits(cnpj)
        valid = is_valid_cnpj(normalized)
        if not valid:
            items.append(
                BulkItemResult(
                    cnpj=normalized or cnpj,
                    valid=False,
                    registration_status="invalid_cnpj",
                    score=None,
                    recommendation="Rejeitar registro: CNPJ invalido",
                )
            )
            distribution.inactive += 1
            distribution.desist += 1
            continue

        score, _, recommendation, registration_status = evaluate_cnpj_due_diligence(normalized)
        items.append(
            BulkItemResult(
                cnpj=normalized,
                valid=True,
                registration_status=registration_status,
                score=score,
                recommendation=recommendation,
            )
        )

        score_acc += score
        score_count += 1
        if registration_status == "active":
            distribution.active += 1
        else:
            distribution.inactive += 1
        if recommendation == "Recomendado para Assinatura":
            distribution.recommended += 1
        elif recommendation == "Atencao: Requer Analise Humana":
            distribution.attention += 1
        else:
            distribution.desist += 1

    average = round(score_acc / score_count, 2) if score_count else None
    return items, distribution, average


def extract_nfe_access_key(text: str) -> str | None:
    match = NFE_ACCESS_KEY_REGEX.search(text)
    return match.group(1) if match else None


def validate_nfe_access_key(access_key: str | None) -> bool:
    if not access_key or len(access_key) != 44 or not access_key.isdigit():
        return False
    digits = [int(ch) for ch in access_key]
    dv = digits[-1]
    weights = [2, 3, 4, 5, 6, 7, 8, 9]
    total = 0
    for idx, num in enumerate(reversed(digits[:-1])):
        total += num * weights[idx % len(weights)]
    remainder = total % 11
    calc = 0 if remainder in {0, 1} else 11 - remainder
    return calc == dv


def simulate_sefaz_status(access_key: str) -> str:
    provider_result = fetch_nfe_status(access_key)
    if provider_result.sefaz_status:
        return provider_result.sefaz_status

    bucket = _simulate_signal(access_key, "sefaz")
    if bucket < 70:
        return "Autorizada"
    if bucket < 82:
        return "Cancelada"
    if bucket < 92:
        return "Denegada"
    return "Inexistente"
