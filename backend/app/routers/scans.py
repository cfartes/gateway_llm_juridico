from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.models.scan_job import ScanJob
from app.schemas.analysis import AnalysisResult, ScanResponse
from app.schemas.document import DocumentOut
from app.utils.crypto import decrypt_text


router = APIRouter(prefix="/scans", tags=["scans"])


def _parse_result(raw: str | None) -> AnalysisResult | None:
    if not raw:
        return None
    try:
        return AnalysisResult.model_validate_json(decrypt_text(raw))
    except Exception:
        return AnalysisResult.model_validate_json(raw)


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

