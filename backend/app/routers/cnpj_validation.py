from fastapi import APIRouter, Depends, File, UploadFile

from app.core.deps import require_roles
from app.core.types import UserRole
from app.pipelines.analysis_graph import analyze_document_bytes
from app.schemas.cnpj_validation import DueDiligenceResponse, BulkUpdateResponse, InvoiceValidationResponse
from app.services.cnpj_validation_service import (
    build_security_gate,
    evaluate_bulk_cnpjs,
    evaluate_cnpj_due_diligence,
    extract_cnpjs,
    extract_document_text,
    extract_first_cnpj,
    extract_nfe_access_key,
    simulate_sefaz_status,
    validate_nfe_access_key,
)
from app.services.file_validation import validate_file_metadata
from app.utils.br_docs import is_valid_cnpj


router = APIRouter(prefix="/cnpj-validation", tags=["cnpj-validation"])


def _run_security_gate(filename: str, content: bytes):
    result = analyze_document_bytes(filename, content)
    return result, build_security_gate(result)


@router.post("/due-diligence", response_model=DueDiligenceResponse)
async def due_diligence_from_contract(
    file: UploadFile = File(...),
    _auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
):
    content = await file.read()
    filename = file.filename or "contract.bin"
    validate_file_metadata(filename, file.content_type, len(content))

    analysis, gate = _run_security_gate(filename, content)
    if not gate.safe_to_continue:
        return DueDiligenceResponse(
            security_gate=gate,
            summary="Arquivo bloqueado no gateway de seguranca antes da etapa de due diligence.",
        )

    text = extract_document_text(filename, content)
    cnpj = extract_first_cnpj(text)
    if not cnpj:
        return DueDiligenceResponse(
            security_gate=gate,
            summary="Nenhum CNPJ identificado no contrato apos a sanitizacao.",
        )
    if not is_valid_cnpj(cnpj):
        return DueDiligenceResponse(
            security_gate=gate,
            cnpj=cnpj,
            cnpj_valid=False,
            summary="CNPJ identificado no contrato, mas invalido.",
        )

    score, criteria, recommendation, _ = evaluate_cnpj_due_diligence(cnpj)
    return DueDiligenceResponse(
        security_gate=gate,
        cnpj=cnpj,
        cnpj_valid=True,
        score=score,
        recommendation=recommendation,
        criteria=criteria,
        summary=(
            f"CNPJ {cnpj} processado com score {score}/100. "
            f"Recomendacao: {recommendation}."
        ),
    )


@router.post("/bulk-update", response_model=BulkUpdateResponse)
async def bulk_update_from_file(
    file: UploadFile = File(...),
    _auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
):
    content = await file.read()
    filename = file.filename or "cnpj-list.bin"
    validate_file_metadata(filename, file.content_type, len(content))

    _, gate = _run_security_gate(filename, content)
    if not gate.safe_to_continue:
        return BulkUpdateResponse(
            security_gate=gate,
            distribution={"active": 0, "inactive": 0, "attention": 0, "recommended": 0, "desist": 0},
            summary="Arquivo de lote bloqueado no gateway de seguranca.",
        )

    text = extract_document_text(filename, content)
    cnpjs = extract_cnpjs(text)
    if not cnpjs:
        return BulkUpdateResponse(
            security_gate=gate,
            distribution={"active": 0, "inactive": 0, "attention": 0, "recommended": 0, "desist": 0},
            summary="Nenhum CNPJ encontrado no arquivo de lote.",
        )

    items, distribution, average_score = evaluate_bulk_cnpjs(cnpjs)
    total_valid = sum(1 for item in items if item.valid)
    total_invalid = len(items) - total_valid
    return BulkUpdateResponse(
        security_gate=gate,
        total_extracted=len(items),
        total_valid=total_valid,
        total_invalid=total_invalid,
        average_score=average_score,
        distribution=distribution,
        items=items,
        summary=(
            f"Lote processado com {len(items)} registros. "
            f"Validos: {total_valid}. Invalidos: {total_invalid}."
        ),
    )


@router.post("/invoice-validation", response_model=InvoiceValidationResponse)
async def validate_invoice(
    file: UploadFile = File(...),
    _auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
):
    content = await file.read()
    filename = file.filename or "invoice.bin"
    validate_file_metadata(filename, file.content_type, len(content))

    _, gate = _run_security_gate(filename, content)
    if not gate.safe_to_continue:
        return InvoiceValidationResponse(
            security_gate=gate,
            sefaz_status="Bloqueada por seguranca",
            recommendation="Nao prosseguir com recebimento financeiro ate revisao do comite de seguranca.",
            summary="NF bloqueada no gateway de seguranca antes da validacao fiscal.",
        )

    text = extract_document_text(filename, content)
    cnpj = extract_first_cnpj(text)
    access_key = extract_nfe_access_key(text)
    access_key_valid = validate_nfe_access_key(access_key)
    emitter_cnpj_valid = is_valid_cnpj(cnpj) if cnpj else False

    if not access_key:
        return InvoiceValidationResponse(
            security_gate=gate,
            emitter_cnpj=cnpj,
            emitter_cnpj_valid=emitter_cnpj_valid,
            sefaz_status="Chave nao localizada",
            recommendation="Revisao manual obrigatoria: nao foi possivel localizar chave de acesso da NF-e.",
            summary="Nao foi encontrada chave de acesso de 44 digitos no documento fiscal.",
        )
    if not access_key_valid:
        return InvoiceValidationResponse(
            security_gate=gate,
            access_key=access_key,
            access_key_valid=False,
            emitter_cnpj=cnpj,
            emitter_cnpj_valid=emitter_cnpj_valid,
            sefaz_status="Chave invalida",
            recommendation="Rejeitar nota ou solicitar reenvio com chave de acesso valida.",
            summary="Chave de acesso encontrada, mas falhou na validacao de digito verificador.",
        )

    sefaz_status = simulate_sefaz_status(access_key)
    if sefaz_status == "Autorizada":
        recommendation = "NF apta para continuidade do fluxo financeiro."
    elif sefaz_status == "Cancelada":
        recommendation = "Bloquear pagamento: nota cancelada na SEFAZ."
    elif sefaz_status == "Denegada":
        recommendation = "Bloquear recebimento: nota denegada na SEFAZ."
    else:
        recommendation = "Revisao manual obrigatoria: nota nao localizada na base SEFAZ."

    return InvoiceValidationResponse(
        security_gate=gate,
        access_key=access_key,
        access_key_valid=True,
        emitter_cnpj=cnpj,
        emitter_cnpj_valid=emitter_cnpj_valid,
        sefaz_status=sefaz_status,
        recommendation=recommendation,
        summary=(
            f"Validacao fiscal concluida. Status SEFAZ: {sefaz_status}. "
            f"CNPJ emitente valido: {'sim' if emitter_cnpj_valid else 'nao'}."
        ),
    )
