import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import ScanStatus, UserRole
from app.models.scan_job import ScanJob
from app.schemas.analysis import AnalysisResult
from app.schemas.analyze_gateway import (
    AnalyzeJobResponse,
    AnalyzeJobStatusResponse,
    AnalyzeRequest,
    AnalyzeResultPayload,
    AnalyzeReturnMode,
    WebhookResultAck,
    WebhookResultPayload,
)
from app.services.analyze_gateway_service import (
    create_document_record,
    create_scan_job,
    format_analyze_payload,
    generate_rag_markdown,
    load_source_content,
    parse_analyze_json_payload,
    parse_integration_meta,
)
from app.services.file_validation import validate_file_metadata
from app.services.queue_policy_service import (
    classify_file_tier,
    enforce_scan_enqueue_policy,
    resolve_tenant_plan,
    tier_to_queue,
)
from app.tasks.scan_tasks import analyze_gateway_task
from app.utils.crypto import decrypt_text, encrypt_text


analyze_router = APIRouter(prefix="/analyze", tags=["analyze-gateway"])
files_router = APIRouter(prefix="/files", tags=["analyze-files"])
webhook_router = APIRouter(prefix="/webhooks", tags=["analyze-webhooks"])


def _to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


async def _extract_request_payload(request: Request, upload_file: UploadFile | None) -> tuple[AnalyzeRequest, UploadFile | None]:
    content_type = request.headers.get("content-type", "").lower()

    if "multipart/form-data" in content_type:
        form = await request.form()
        mapped: dict[str, Any] = {
            "source_type": form.get("source_type"),
            "return_mode": form.get("return_mode") or "full_report",
            "sanitize": _to_bool(form.get("sanitize"), True),
            "generate_rag_md": _to_bool(form.get("generate_rag_md"), True),
            "tenant_id": form.get("tenant_id"),
            "external_reference": form.get("external_reference"),
            "callback_url": form.get("callback_url"),
            "callback_secret": form.get("callback_secret"),
            "callback_auth_bearer": form.get("callback_auth_bearer"),
            "url": form.get("url"),
            "text": form.get("text"),
            "base64_content": form.get("base64_content"),
            "filename": form.get("filename"),
        }
        metadata_raw = form.get("metadata")
        if metadata_raw:
            try:
                mapped["metadata"] = json.loads(str(metadata_raw))
            except Exception:
                mapped["metadata"] = {"raw": str(metadata_raw)}

        form_file = form.get("file")
        if not upload_file and isinstance(form_file, UploadFile):
            upload_file = form_file

        return parse_analyze_json_payload(mapped), upload_file

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    return parse_analyze_json_payload(payload), upload_file


def _parse_scan_result(scan: ScanJob) -> AnalysisResult | None:
    if not scan.result_json:
        return None
    try:
        return AnalysisResult.model_validate_json(decrypt_text(scan.result_json))
    except Exception:
        return None


def _build_payload_for_scan(scan: ScanJob, return_mode: AnalyzeReturnMode) -> AnalyzeResultPayload | None:
    result = _parse_scan_result(scan)
    if not result:
        return None

    rag_markdown = None
    rag_markdown_url = None
    chunks = None

    if return_mode == AnalyzeReturnMode.RAG_MARKDOWN and scan.rag_markdown_path:
        path = Path(scan.rag_markdown_path)
        if path.exists():
            rag_markdown = path.read_text(encoding="utf-8")
            rag_markdown_url = f"/api/v1/files/{scan.document_id}/rag-md"

    return format_analyze_payload(
        result=result,
        return_mode=return_mode,
        rag_markdown=rag_markdown,
        rag_markdown_url=rag_markdown_url,
        chunks=chunks,
    )


@analyze_router.post("", response_model=AnalyzeResultPayload)
async def analyze_sync(
    request: Request,
    file: UploadFile | None = File(default=None),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    req, upload_file = await _extract_request_payload(request, file)

    if req.tenant_id and req.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=403, detail="tenant_id does not match authenticated tenant")

    content, filename, mime_type = load_source_content(req, upload_file)
    validate_file_metadata(filename, mime_type, len(content))

    document = create_document_record(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        source_type=req.source_type,
        filename=filename,
        mime_type=mime_type,
        content=content,
    )

    integration_meta = {
        "return_mode": req.return_mode,
        "sanitize": req.sanitize,
        "generate_rag_md": req.generate_rag_md,
        "external_reference": req.external_reference,
        "callback_url": str(req.callback_url) if req.callback_url else None,
        "callback_secret": req.callback_secret,
        "callback_auth_bearer": req.callback_auth_bearer,
        "metadata": req.metadata or {},
    }
    scan = create_scan_job(db, auth.tenant_id, document.id, integration_meta)

    from app.pipelines.analysis_graph import analyze_document_bytes

    result = analyze_document_bytes(filename, content)
    rag_markdown = None
    rag_markdown_url = None
    chunks = []

    if req.generate_rag_md:
        rag_path, chunks = generate_rag_markdown(document, result)
        scan.rag_markdown_path = rag_path
        rag_markdown = Path(rag_path).read_text(encoding="utf-8")
        rag_markdown_url = f"/api/v1/files/{document.id}/rag-md"

    scan.status = ScanStatus.COMPLETED
    scan.threat_score = result.threat_score
    scan.risk_level = result.risk_level
    scan.summary = result.technical_explanation
    scan.result_json = encrypt_text(json.dumps(result.model_dump(), ensure_ascii=False))
    db.add(scan)
    db.commit()

    return format_analyze_payload(
        result=result,
        return_mode=req.return_mode,
        rag_markdown=rag_markdown,
        rag_markdown_url=rag_markdown_url,
        chunks=chunks,
    )


@analyze_router.post("/jobs", response_model=AnalyzeJobResponse)
async def analyze_async(
    request: Request,
    file: UploadFile | None = File(default=None),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    req, upload_file = await _extract_request_payload(request, file)

    if req.tenant_id and req.tenant_id != auth.tenant_id:
        raise HTTPException(status_code=403, detail="tenant_id does not match authenticated tenant")

    tenant_plan = resolve_tenant_plan(db, auth.tenant_id)
    enforce_scan_enqueue_policy(db, auth.tenant_id, tenant_plan)

    content, filename, mime_type = load_source_content(req, upload_file)
    validate_file_metadata(filename, mime_type, len(content))

    document = create_document_record(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        source_type=req.source_type,
        filename=filename,
        mime_type=mime_type,
        content=content,
    )

    integration_meta = {
        "return_mode": req.return_mode,
        "sanitize": req.sanitize,
        "generate_rag_md": req.generate_rag_md,
        "external_reference": req.external_reference,
        "callback_url": str(req.callback_url) if req.callback_url else None,
        "callback_secret": req.callback_secret,
        "callback_auth_bearer": req.callback_auth_bearer,
        "metadata": req.metadata or {},
    }
    scan = create_scan_job(db, auth.tenant_id, document.id, integration_meta)

    queue_name = tier_to_queue(classify_file_tier(document.original_name))
    analyze_gateway_task.apply_async(args=[scan.id, document.storage_path], queue=queue_name, routing_key=queue_name)

    return AnalyzeJobResponse(job_id=scan.id, file_id=document.id, status=str(scan.status), created_at=scan.created_at)


@analyze_router.get("/jobs/{job_id}", response_model=AnalyzeJobStatusResponse)
def get_analyze_job(job_id: str, auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    scan = db.query(ScanJob).filter(ScanJob.id == job_id, ScanJob.tenant_id == auth.tenant_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Job not found")

    metadata = parse_integration_meta(scan)
    return_mode_raw = metadata.get("return_mode", "full_report")
    try:
        return_mode = AnalyzeReturnMode(return_mode_raw)
    except Exception:
        return_mode = AnalyzeReturnMode.FULL_REPORT

    payload = None
    if scan.status == ScanStatus.COMPLETED:
        payload = _build_payload_for_scan(scan, return_mode)

    return AnalyzeJobStatusResponse(
        job_id=scan.id,
        file_id=scan.document_id,
        status=str(scan.status),
        result=payload,
        error_message=scan.error_message,
    )


@files_router.get("/{file_id}/rag-md", response_class=PlainTextResponse)
def get_file_rag_markdown(file_id: str, auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    scan = (
        db.query(ScanJob)
        .filter(ScanJob.document_id == file_id, ScanJob.tenant_id == auth.tenant_id, ScanJob.status == ScanStatus.COMPLETED)
        .order_by(ScanJob.updated_at.desc())
        .first()
    )
    if not scan or not scan.rag_markdown_path:
        raise HTTPException(status_code=404, detail="RAG markdown not available")

    path = Path(scan.rag_markdown_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="RAG markdown not available")
    return path.read_text(encoding="utf-8")


@files_router.get("/{file_id}/report", response_model=AnalyzeResultPayload)
def get_file_report(file_id: str, auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    scan = (
        db.query(ScanJob)
        .filter(ScanJob.document_id == file_id, ScanJob.tenant_id == auth.tenant_id, ScanJob.status == ScanStatus.COMPLETED)
        .order_by(ScanJob.updated_at.desc())
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Report not available")

    payload = _build_payload_for_scan(scan, AnalyzeReturnMode.FULL_REPORT)
    if not payload:
        raise HTTPException(status_code=404, detail="Report not available")
    return payload


@webhook_router.post("/result", response_model=WebhookResultAck)
def receive_webhook_result(payload: WebhookResultPayload):
    _ = payload
    return WebhookResultAck()
