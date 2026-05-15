import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.limiter import rate_limit_dependency
from app.core.types import ScanStatus, UserRole
from app.models.document import Document
from app.models.scan_job import ScanJob
from app.pipelines.analysis_graph import analyze_document_bytes
from app.schemas.analysis import AnalysisResult, EvidenceItem, ScanJobOut, ScanResponse
from app.schemas.document import DocumentOut
from app.services.audit_service import write_audit_log
from app.services.file_validation import detect_office_macro, inspect_zip_for_blocked_files, validate_file_metadata
from app.services.policy_enforcement import decide_policy_action, quarantine_status_from_action
from app.services.queue_policy_service import (
    classify_file_tier,
    enforce_scan_enqueue_policy,
    resolve_tenant_plan,
    tier_to_queue,
)
from app.services.remote_fetch import download_url_content
from app.services.scoring import compute_threat_score, risk_from_score
from app.tasks.scan_tasks import scan_document_task
from app.utils.common import ensure_dir, sha256_bytes
from app.utils.crypto import encrypt_text


router = APIRouter(prefix="/uploads", tags=["uploads"])
STORAGE_ROOT = Path("storage")
ensure_dir(STORAGE_ROOT)


class URLScanRequest(BaseModel):
    url: HttpUrl
    async_mode: bool = True


def _save_document_record(
    db: Session,
    *,
    tenant_id: str,
    user_id: str | None,
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
        source_type="file",
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


def _create_scan_job(db: Session, tenant_id: str, document_id: str) -> ScanJob:
    scan = ScanJob(tenant_id=tenant_id, document_id=document_id, status=ScanStatus.PENDING)
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def _build_scan_response(document: Document, scan: ScanJob, result: AnalysisResult | None) -> ScanResponse:
    return ScanResponse(
        document=DocumentOut.model_validate(document),
        scan=ScanJobOut.model_validate(scan),
        result=result,
    )


@router.post("/scan-sync", response_model=list[ScanResponse])
async def scan_sync(
    request: Request,
    files: list[UploadFile] = File(...),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    rate_limit_dependency(request, key=f"{auth.tenant_id}:scan-sync")

    responses: list[ScanResponse] = []
    for upload in files:
        content = await upload.read()
        validate_file_metadata(upload.filename or "file.bin", upload.content_type, len(content))

        document = _save_document_record(
            db,
            tenant_id=auth.tenant_id,
            user_id=auth.user_id,
            filename=upload.filename or "file.bin",
            mime_type=upload.content_type or "application/octet-stream",
            content=content,
        )
        scan = _create_scan_job(db, auth.tenant_id, document.id)

        macro_detected = detect_office_macro(document.original_name, content)
        if document.extension == ".zip":
            blocked_entries = inspect_zip_for_blocked_files(Path(document.storage_path))
            if blocked_entries:
                raise HTTPException(status_code=400, detail=f"ZIP has blocked files: {blocked_entries[:5]}")

        result = analyze_document_bytes(document.original_name, content)
        if macro_detected:
            result.evidences.append(
                EvidenceItem(
                    category="office_macro",
                    severity="high",
                    snippet="Possible macro stream reference in OOXML package.",
                    explanation="Document may contain VBA macro indicators.",
                )
            )
            result.threat_score = compute_threat_score(result.evidences, result.risk_level)
            result.risk_level = risk_from_score(result.threat_score)

        scan.status = ScanStatus.COMPLETED
        scan.threat_score = result.threat_score
        scan.risk_level = result.risk_level
        scan.summary = result.technical_explanation
        scan.result_json = encrypt_text(json.dumps(result.model_dump(), ensure_ascii=False))
        policy = decide_policy_action(result)
        scan.policy_action = policy.action
        scan.policy_reason = policy.reason
        scan.quarantine_status = quarantine_status_from_action(policy.action)
        db.add(scan)
        db.commit()
        db.refresh(scan)

        write_audit_log(
            db,
            tenant_id=auth.tenant_id,
            action="scan.sync",
            resource_type="document",
            resource_id=document.id,
            actor_user_id=auth.user_id,
            actor_api_token_id=auth.api_token_id,
            source_ip=get_request_ip(request),
            details={"filename": document.original_name, "score": result.threat_score},
        )

        responses.append(_build_scan_response(document, scan, result))

    return responses


@router.post("/scan-async", response_model=list[ScanResponse])
async def scan_async(
    request: Request,
    files: list[UploadFile] = File(...),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    rate_limit_dependency(request, key=f"{auth.tenant_id}:scan-async")
    tenant_plan = resolve_tenant_plan(db, auth.tenant_id)

    responses: list[ScanResponse] = []
    for upload in files:
        enforce_scan_enqueue_policy(db, auth.tenant_id, tenant_plan)

        content = await upload.read()
        validate_file_metadata(upload.filename or "file.bin", upload.content_type, len(content))

        document = _save_document_record(
            db,
            tenant_id=auth.tenant_id,
            user_id=auth.user_id,
            filename=upload.filename or "file.bin",
            mime_type=upload.content_type or "application/octet-stream",
            content=content,
        )
        scan = _create_scan_job(db, auth.tenant_id, document.id)
        queue_tier = classify_file_tier(document.original_name)
        queue_name = tier_to_queue(queue_tier)
        scan_document_task.apply_async(args=[scan.id, document.storage_path], queue=queue_name, routing_key=queue_name)

        write_audit_log(
            db,
            tenant_id=auth.tenant_id,
            action="scan.async.queued",
            resource_type="scan",
            resource_id=scan.id,
            actor_user_id=auth.user_id,
            actor_api_token_id=auth.api_token_id,
            source_ip=get_request_ip(request),
            details={"filename": document.original_name, "queue": queue_name, "plan": str(tenant_plan)},
        )

        responses.append(_build_scan_response(document, scan, None))

    return responses


@router.post("/scan-url", response_model=ScanResponse)
def scan_from_url(
    payload: URLScanRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    rate_limit_dependency(request, key=f"{auth.tenant_id}:scan-url")
    tenant_plan = resolve_tenant_plan(db, auth.tenant_id)

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content, filename, content_type = download_url_content(str(payload.url), max_bytes)

    validate_file_metadata(filename, content_type, len(content))

    document = _save_document_record(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        filename=filename,
        mime_type=content_type,
        content=content,
    )
    scan = _create_scan_job(db, auth.tenant_id, document.id)

    if payload.async_mode:
        enforce_scan_enqueue_policy(db, auth.tenant_id, tenant_plan)
        queue_tier = classify_file_tier(document.original_name)
        queue_name = tier_to_queue(queue_tier)
        scan_document_task.apply_async(args=[scan.id, document.storage_path], queue=queue_name, routing_key=queue_name)
        result = None
    else:
        result = analyze_document_bytes(document.original_name, content)
        scan.status = ScanStatus.COMPLETED
        scan.threat_score = result.threat_score
        scan.risk_level = result.risk_level
        scan.summary = result.technical_explanation
        scan.result_json = encrypt_text(json.dumps(result.model_dump(), ensure_ascii=False))
        policy = decide_policy_action(result)
        scan.policy_action = policy.action
        scan.policy_reason = policy.reason
        scan.quarantine_status = quarantine_status_from_action(policy.action)
        db.add(scan)
        db.commit()
        db.refresh(scan)

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="scan.url",
        resource_type="document",
        resource_id=document.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "url": str(payload.url),
            "async_mode": payload.async_mode,
            "plan": str(tenant_plan),
        },
    )

    return _build_scan_response(document, scan, result)

