import base64
import hashlib
import hmac
import json
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.types import ScanStatus
from app.models.document import Document
from app.models.scan_job import ScanJob
from app.schemas.analysis import AnalysisResult
from app.schemas.analyze_gateway import AnalyzeRequest, AnalyzeResultPayload, AnalyzeReturnMode, ThreatItem
from app.services.document_parser import parse_document_bytes
from app.services.ocr_service import extract_ocr_text
from app.services.policy_enforcement import PolicyDecision, decide_policy_action
from app.services.sanitizer import sanitize_text
from app.utils.common import ensure_dir, sha256_bytes
from app.utils.crypto import decrypt_text, encrypt_text


STORAGE_ROOT = Path("backend/storage")
ensure_dir(STORAGE_ROOT)


def parse_analyze_json_payload(payload: dict[str, Any]) -> AnalyzeRequest:
    try:
        return AnalyzeRequest.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid request payload: {exc}") from exc


def load_source_content(req: AnalyzeRequest, upload_file: UploadFile | None) -> tuple[bytes, str, str]:
    if req.source_type == "file":
        if not upload_file:
            raise HTTPException(status_code=400, detail="file is required for source_type=file")
        content = upload_file.file.read()
        filename = upload_file.filename or req.filename or "upload.bin"
        mime_type = upload_file.content_type or "application/octet-stream"
        return content, filename, mime_type

    if req.source_type == "url":
        if not req.url:
            raise HTTPException(status_code=400, detail="url is required for source_type=url")
        from app.services.remote_fetch import download_url_content

        max_bytes = 100 * 1024 * 1024
        data, filename, content_type = download_url_content(str(req.url), max_bytes)
        return data, filename, content_type

    if req.source_type == "text":
        if not req.text:
            raise HTTPException(status_code=400, detail="text is required for source_type=text")
        return req.text.encode("utf-8"), req.filename or "input.txt", "text/plain"

    if req.source_type == "base64":
        if not req.base64_content:
            raise HTTPException(status_code=400, detail="base64_content is required for source_type=base64")
        try:
            decoded = base64.b64decode(req.base64_content)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid base64_content") from exc
        filename = req.filename or "input.bin"
        return decoded, filename, "application/octet-stream"

    raise HTTPException(status_code=400, detail="Unsupported source_type")


def create_document_record(
    db: Session,
    *,
    tenant_id: str,
    user_id: str | None,
    source_type: str,
    filename: str,
    mime_type: str,
    content: bytes,
) -> Document:
    ext = Path(filename).suffix.lower() or ".bin"
    file_sha = sha256_bytes(content)
    tenant_dir = STORAGE_ROOT / tenant_id
    ensure_dir(tenant_dir)
    storage_path = tenant_dir / f"{file_sha}{ext}"
    storage_path.write_bytes(content)

    document = Document(
        tenant_id=tenant_id,
        uploaded_by_user_id=user_id,
        source_type=source_type,
        original_name=filename,
        mime_type=mime_type,
        extension=ext,
        size_bytes=len(content),
        storage_path=str(storage_path),
        sha256=file_sha,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def create_scan_job(db: Session, tenant_id: str, document_id: str, integration_meta: dict[str, Any]) -> ScanJob:
    scan = ScanJob(
        tenant_id=tenant_id,
        document_id=document_id,
        status=ScanStatus.PENDING,
        integration_meta_json=encrypt_text(json.dumps(integration_meta, ensure_ascii=False)),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def build_threats(result: AnalysisResult) -> list[ThreatItem]:
    threats: list[ThreatItem] = []
    for evidence in result.evidences:
        threats.append(
            ThreatItem(
                type=evidence.category,
                severity=evidence.severity.upper(),
                evidence=evidence.snippet,
                location="document",
                explanation=evidence.explanation,
            )
        )
    return threats


def is_safe_for_rag(result: AnalysisResult) -> bool:
    decision = decide_policy_action(result)
    return decision.safe_for_rag


def build_recommendation(safe_for_rag: bool, policy: PolicyDecision | None = None) -> str:
    if policy and policy.action == "block":
        return "Documento bloqueado. Nao enviar para LLM/RAG e iniciar fluxo de resposta a incidente."
    if policy and policy.action == "quarantine":
        return "Documento em quarentena. Revisao manual obrigatoria antes de qualquer uso em IA."
    if safe_for_rag:
        return "Documento liberado para ingestao em RAG apos sanitizacao."
    return "Documento nao deve ser enviado diretamente para uma LLM."


def infer_language(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in [" de ", " para ", " nao ", " documento "]):
        return "pt-BR"
    return "en"


def build_chunks(sanitized_text: str) -> list[dict[str, Any]]:
    clean = sanitized_text.strip()
    if not clean:
        return []

    target = 1200
    chunks: list[dict[str, Any]] = []
    cursor = 0
    index = 1
    while cursor < len(clean):
        piece = clean[cursor : cursor + target]
        chunks.append(
            {
                "title": f"Chunk {index}",
                "content": piece,
                "metadata": {
                    "section": "Sanitized Content",
                    "tokens_estimados": max(1, len(piece) // 4),
                    "risco": "LOW",
                },
            }
        )
        cursor += target
        index += 1
    return chunks


def generate_rag_markdown(document: Document, result: AnalysisResult) -> tuple[str, list[dict[str, Any]]]:
    raw_bytes = Path(document.storage_path).read_bytes()
    parsed = parse_document_bytes(document.original_name, raw_bytes)
    ocr_text = extract_ocr_text(document.original_name, raw_bytes)
    combined_text = "\n".join(filter(None, [parsed.text, ocr_text]))
    sanitized_text = sanitize_text(combined_text)

    chunks = build_chunks(sanitized_text)
    policy = decide_policy_action(result)
    safe_for_rag = policy.safe_for_rag

    frontmatter = {
        "document_id": document.id,
        "source_file": document.original_name,
        "analysis_date": document.updated_at.date().isoformat(),
        "risk_level": result.risk_level.upper(),
        "risk_score": int(round(result.threat_score)),
        "safe_for_rag": safe_for_rag,
        "sanitized": True,
        "language": infer_language(sanitized_text),
        "content_type": result.content_classification,
    }

    front = "\n".join([f"{key}: \"{value}\"" for key, value in frontmatter.items()])

    suspicious_section = "\n".join(
        [
            f"### Remocao {idx + 1}\n\nTipo: {ev.category}  \nSeveridade: {ev.severity.upper()}  \nMotivo: {ev.explanation}."
            for idx, ev in enumerate(result.evidences)
        ]
    )

    chunks_md = "\n\n".join(
        [
            f"### {chunk['title']}\n\n{chunk['content']}\n\nMetadados:\n- secao: {chunk['metadata']['section']}\n- tokens_estimados: {chunk['metadata']['tokens_estimados']}\n- risco: {chunk['metadata']['risco']}"
            for chunk in chunks
        ]
    )

    markdown = f"""---
{front}
---

# {document.original_name}

## Resumo Executivo

{result.technical_explanation}

## Metadados

- Origem: {document.source_type}
- Idioma: {infer_language(sanitized_text)}
- Classificacao: {result.content_classification}
- Status de seguranca: {'aprovado para RAG' if safe_for_rag else 'revisao necessaria'}

## Conteudo Sanitizado

{sanitized_text[:12000]}

## Tabelas Extraidas

| Campo | Valor |
|---|---|
| source_file | {document.original_name} |
| size_bytes | {document.size_bytes} |

## Imagens e OCR

{ocr_text[:2000] if ocr_text else 'Nenhum bloco OCR adicional detectado.'}

## Chunks sugeridos para RAG

{chunks_md if chunks_md else 'Sem chunks sugeridos.'}

## Trechos Removidos por Seguranca

{suspicious_section if suspicious_section else 'Nenhum trecho removido.'}

## Recomendacoes

{build_recommendation(safe_for_rag, policy)}
"""

    rag_path = Path(document.storage_path).with_suffix(Path(document.storage_path).suffix + ".rag.md")
    rag_path.write_text(markdown, encoding="utf-8")
    return str(rag_path), chunks


def format_analyze_payload(
    *,
    result: AnalysisResult,
    return_mode: AnalyzeReturnMode,
    rag_markdown: str | None = None,
    rag_markdown_url: str | None = None,
    chunks: list[dict[str, Any]] | None = None,
) -> AnalyzeResultPayload:
    threats = build_threats(result)
    policy = decide_policy_action(result)
    safe = policy.safe_for_rag

    payload = AnalyzeResultPayload(
        has_threat=len(threats) > 0,
        risk_level=result.risk_level.upper(),
        risk_score=int(round(result.threat_score)),
        threats=threats,
        safe_for_rag=safe,
        recommendation=build_recommendation(safe, policy),
        policy_action=policy.action,
        policy_reason=policy.reason,
    )

    if return_mode in {AnalyzeReturnMode.FULL_REPORT, AnalyzeReturnMode.RAG_MARKDOWN}:
        payload.content_classification = result.content_classification
        payload.technical_explanation = result.technical_explanation
        payload.suspicious_segments = result.suspicious_segments
        payload.exfiltration_indicators = result.exfiltration_indicators

    if return_mode == AnalyzeReturnMode.RAG_MARKDOWN:
        payload.rag_markdown = rag_markdown
        payload.rag_markdown_url = rag_markdown_url
        payload.chunks = chunks or []

    return payload


def parse_integration_meta(scan_job: ScanJob) -> dict[str, Any]:
    if not scan_job.integration_meta_json:
        return {}
    try:
        return json.loads(decrypt_text(scan_job.integration_meta_json))
    except Exception:
        try:
            return json.loads(scan_job.integration_meta_json)
        except Exception:
            return {}


def _build_webhook_signature(secret: str, timestamp: int, raw_body: str) -> str:
    signed_payload = f"{timestamp}.{raw_body}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def trigger_result_webhook(
    callback_url: str,
    payload: dict[str, Any],
    *,
    callback_secret: str | None = None,
    callback_auth_bearer: str | None = None,
    timeout_seconds: float = 15.0,
    max_retries: int = 3,
    base_backoff_seconds: float = 1.0,
) -> dict[str, Any]:
    raw_body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    headers = {"Content-Type": "application/json"}
    timestamp = int(time.time())

    if callback_secret:
        headers["X-Nexus-Webhook-Timestamp"] = str(timestamp)
        headers["X-Nexus-Webhook-Signature"] = _build_webhook_signature(callback_secret, timestamp, raw_body)
    if callback_auth_bearer:
        headers["Authorization"] = f"Bearer {callback_auth_bearer}"

    attempts = max(1, int(max_retries))
    last_error = None

    with httpx.Client(timeout=timeout_seconds) as client:
        for attempt in range(1, attempts + 1):
            try:
                response = client.post(callback_url, content=raw_body.encode("utf-8"), headers=headers)
                if response.status_code < 400:
                    return {"ok": True, "status_code": response.status_code, "attempt": attempt}
                if response.status_code not in {408, 409, 425, 429} and response.status_code < 500:
                    return {"ok": False, "status_code": response.status_code, "attempt": attempt}
                last_error = f"HTTP {response.status_code}"
            except Exception as exc:
                last_error = str(exc)

            if attempt < attempts:
                delay = base_backoff_seconds * (2 ** (attempt - 1))
                time.sleep(delay)

    return {"ok": False, "status_code": None, "attempt": attempts, "error": last_error}
