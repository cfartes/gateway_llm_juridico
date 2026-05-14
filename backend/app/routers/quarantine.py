from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import QuarantineStatus, ScanStatus, UserRole
from app.models.scan_job import ScanJob
from app.schemas.analysis import AnalysisResult
from app.schemas.quarantine import (
    QuarantineDetail,
    QuarantineItem,
    QuarantineReviewAction,
    QuarantineReviewRequest,
    QuarantineReviewResponse,
)
from app.services.analyze_gateway_service import generate_rag_markdown
from app.services.audit_service import write_audit_log
from app.utils.crypto import decrypt_text


router = APIRouter(prefix="/quarantine", tags=["quarantine"])


def _parse_result(raw: str | None) -> AnalysisResult | None:
    if not raw:
        return None
    try:
        return AnalysisResult.model_validate_json(decrypt_text(raw))
    except Exception:
        try:
            return AnalysisResult.model_validate_json(raw)
        except Exception:
            return None


def _to_item(scan: ScanJob, result: AnalysisResult | None = None) -> QuarantineDetail:
    return QuarantineDetail(
        scan_id=scan.id,
        file_id=scan.document_id,
        file_name=scan.document.original_name,
        policy_action=scan.policy_action,
        policy_reason=scan.policy_reason,
        quarantine_status=scan.quarantine_status,
        threat_score=scan.threat_score,
        risk_level=scan.risk_level,
        reviewed_by_user_id=scan.reviewed_by_user_id,
        reviewed_at=scan.reviewed_at,
        rag_markdown_available=bool(scan.rag_markdown_path and Path(scan.rag_markdown_path).exists()),
        created_at=scan.created_at,
        updated_at=scan.updated_at,
        result=result,
        quarantine_note=scan.quarantine_note,
    )


@router.get("", response_model=list[QuarantineItem])
def list_quarantine(
    status: str = Query(default=str(QuarantineStatus.PENDING_REVIEW)),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    query = db.query(ScanJob).filter(ScanJob.tenant_id == auth.tenant_id, ScanJob.status == ScanStatus.COMPLETED)
    if status == "all":
        query = query.filter(ScanJob.quarantine_status.is_not(None))
    else:
        query = query.filter(ScanJob.quarantine_status == status)
    scans = query.order_by(ScanJob.updated_at.desc()).limit(200).all()
    return [_to_item(scan) for scan in scans]


@router.get("/{scan_id}", response_model=QuarantineDetail)
def get_quarantine_scan(
    scan_id: str,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    scan = db.query(ScanJob).filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return _to_item(scan, _parse_result(scan.result_json))


@router.post("/{scan_id}/review", response_model=QuarantineReviewResponse)
def review_quarantine_scan(
    scan_id: str,
    payload: QuarantineReviewRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    if auth.api_token_id:
        raise HTTPException(status_code=403, detail="Quarantine review requires user session")

    scan = db.query(ScanJob).filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != ScanStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Only completed scans can be reviewed")
    if scan.quarantine_status != str(QuarantineStatus.PENDING_REVIEW):
        raise HTTPException(status_code=400, detail="Scan is not pending quarantine review")

    result = _parse_result(scan.result_json)
    if not result:
        raise HTTPException(status_code=400, detail="Scan result not available")

    now = datetime.now(timezone.utc)
    scan.reviewed_by_user_id = auth.user_id
    scan.reviewed_at = now
    scan.quarantine_note = payload.note

    if payload.action == QuarantineReviewAction.APPROVE:
        scan.quarantine_status = str(QuarantineStatus.APPROVED)
        scan.policy_action = "allow"
        scan.policy_reason = "Manually approved from quarantine review."
        if payload.generate_rag_md and not scan.rag_markdown_path:
            rag_path, _chunks = generate_rag_markdown(scan.document, result)
            scan.rag_markdown_path = rag_path
    elif payload.action == QuarantineReviewAction.REJECT:
        scan.quarantine_status = str(QuarantineStatus.REJECTED)
        scan.policy_action = "block"
        scan.policy_reason = "Manually rejected in quarantine review."
        scan.rag_markdown_path = None
    else:
        raise HTTPException(status_code=400, detail="Unsupported review action")

    db.add(scan)
    db.commit()
    db.refresh(scan)

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action=f"quarantine.review.{payload.action}",
        resource_type="scan",
        resource_id=scan.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"note": payload.note, "file_id": scan.document_id},
    )

    return QuarantineReviewResponse(item=_to_item(scan, result))
