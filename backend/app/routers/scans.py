from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import ScanStatus, UserRole
from app.models.scan_job import ScanJob
from app.schemas.analysis import AnalysisResult, ScanResponse
from app.schemas.document import DocumentOut
from app.services.audit_service import write_audit_log
from app.services.queue_policy_service import (
    classify_file_tier,
    enforce_plan_request_rate,
    enforce_scan_enqueue_policy,
    resolve_tenant_plan,
    tier_to_queue,
)
from app.tasks.scan_tasks import analyze_gateway_task, scan_document_task
from app.utils.crypto import decrypt_text


router = APIRouter(prefix="/scans", tags=["scans"])


def _parse_result(raw: str | None) -> AnalysisResult | None:
    if not raw:
        return None
    try:
        return AnalysisResult.model_validate_json(decrypt_text(raw))
    except Exception:
        return AnalysisResult.model_validate_json(raw)


@router.get("", response_model=list[ScanResponse])
def list_scans(auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    scans = (
        db.query(ScanJob)
        .filter(ScanJob.tenant_id == auth.tenant_id)
        .order_by(ScanJob.created_at.desc())
        .limit(100)
        .all()
    )

    return [
        ScanResponse(
            document=DocumentOut.model_validate(scan.document),
            scan=scan,
            result=_parse_result(scan.result_json),
        )
        for scan in scans
    ]


@router.get("/failed", response_model=list[ScanResponse])
def list_failed_scans(auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    scans = (
        db.query(ScanJob)
        .filter(ScanJob.tenant_id == auth.tenant_id, ScanJob.status == ScanStatus.FAILED)
        .order_by(ScanJob.updated_at.desc())
        .limit(100)
        .all()
    )

    return [
        ScanResponse(
            document=DocumentOut.model_validate(scan.document),
            scan=scan,
            result=_parse_result(scan.result_json),
        )
        for scan in scans
    ]


@router.get("/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: str, auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)), db: Session = Depends(get_db)):
    scan = (
        db.query(ScanJob)
        .filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    result = _parse_result(scan.result_json)
    return ScanResponse(document=DocumentOut.model_validate(scan.document), scan=scan, result=result)


@router.post("/{scan_id}/retry", response_model=ScanResponse)
def retry_failed_scan(
    scan_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    scan = (
        db.query(ScanJob)
        .filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != ScanStatus.FAILED:
        raise HTTPException(status_code=409, detail="Only failed scans can be retried")
    if not scan.document or not scan.document.storage_path:
        raise HTTPException(status_code=409, detail="Document source is unavailable for retry")
    if not Path(scan.document.storage_path).exists():
        raise HTTPException(status_code=409, detail="Stored file not found for retry")

    tenant_plan = resolve_tenant_plan(db, auth.tenant_id)
    enforce_plan_request_rate(auth.tenant_id, tenant_plan, operation="async")
    enforce_scan_enqueue_policy(db, auth.tenant_id, tenant_plan)

    queue_tier = classify_file_tier(scan.document.original_name)
    queue_name = tier_to_queue(queue_tier)

    scan.status = ScanStatus.PENDING
    scan.error_message = None
    scan.threat_score = None
    scan.risk_level = None
    scan.summary = None
    scan.result_json = None
    scan.rag_markdown_path = None
    scan.policy_action = None
    scan.policy_reason = None
    scan.quarantine_status = None
    scan.quarantine_note = None
    scan.reviewed_by_user_id = None
    scan.reviewed_at = None
    db.add(scan)
    db.commit()
    db.refresh(scan)

    task = analyze_gateway_task if scan.integration_meta_json else scan_document_task
    try:
        task.apply_async(args=[scan.id, scan.document.storage_path], queue=queue_name, routing_key=queue_name)
    except Exception as exc:
        scan.status = ScanStatus.FAILED
        scan.error_message = f"Failed to enqueue retry: {exc}"
        db.add(scan)
        db.commit()
        raise HTTPException(status_code=500, detail="Failed to enqueue retry") from exc

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="scan.retry",
        resource_type="scan",
        resource_id=scan.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"queue": queue_name, "plan": str(tenant_plan)},
    )

    return ScanResponse(
        document=DocumentOut.model_validate(scan.document),
        scan=scan,
        result=None,
    )


@router.get("/{scan_id}/sanitized.txt", response_class=PlainTextResponse)
def export_sanitized_text(
    scan_id: str,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    scan = db.query(ScanJob).filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id).first()
    if not scan or not scan.result_json:
        raise HTTPException(status_code=404, detail="Sanitized content not available")

    result = _parse_result(scan.result_json)
    if not result:
        raise HTTPException(status_code=404, detail="Sanitized content not available")
    return result.sanitized_text_preview

