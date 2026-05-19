from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import ScanStatus, UserRole
from app.models.scan_job import ScanJob
from app.schemas.analysis import AnalysisResult, ScanResponse
from app.schemas.document import DocumentOut
from app.services.audit_service import write_audit_log
from app.services.analyze_gateway_service import build_structured_sanitized_markdown
from app.services.document_parser import parse_document_bytes
from app.services.ocr_service import extract_ocr_text
from app.services.queue_policy_service import (
    classify_file_tier,
    enforce_plan_request_rate,
    enforce_scan_enqueue_policy,
    resolve_tenant_plan,
    tier_to_queue,
)
from app.services.sanitizer import sanitize_text
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


def _resolved_sanitized_text(result: AnalysisResult) -> str:
    full = (result.sanitized_text_full or "").strip()
    if full:
        return full
    return (result.sanitized_text_preview or "").strip()


def _rebuild_sanitized_from_source(scan: ScanJob) -> str:
    if not scan.document or not scan.document.storage_path:
        return ""
    path = Path(scan.document.storage_path)
    if not path.exists():
        return ""
    try:
        content = path.read_bytes()
        parsed = parse_document_bytes(scan.document.original_name, content)
        ocr_text = extract_ocr_text(scan.document.original_name, content)
        combined = "\n".join(filter(None, [parsed.text, ocr_text]))
        return sanitize_text(combined)
    except Exception:
        return ""


def _build_markdown_export(scan: ScanJob, result: AnalysisResult, sanitized_text: str) -> str:
    if scan.rag_markdown_path:
        try:
            path = Path(scan.rag_markdown_path)
            if path.exists():
                return path.read_text(encoding="utf-8")
        except Exception:
            pass

    return build_structured_sanitized_markdown(
        document_id=scan.document_id,
        source_file=scan.document.original_name if scan.document else f"scan-{scan.id}",
        source_type=scan.document.source_type if scan.document else "file",
        analysis_date=scan.updated_at.date().isoformat(),
        risk_level=scan.risk_level or "unknown",
        risk_score=int(round(scan.threat_score or 0)),
        content_classification=result.content_classification,
        technical_explanation=result.technical_explanation,
        sanitized_text=sanitized_text,
        evidences=[item.model_dump() for item in result.evidences],
        safe_for_rag=(scan.policy_action or "").lower() != "block",
    )


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
    format: str = Query(default="txt", pattern="^(txt|md|json)$"),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    scan = db.query(ScanJob).filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id).first()
    if not scan or not scan.result_json:
        raise HTTPException(status_code=404, detail="Sanitized content not available")

    result = _parse_result(scan.result_json)
    if not result:
        raise HTTPException(status_code=404, detail="Sanitized content not available")
    full_text = (result.sanitized_text_full or "").strip()
    preview_text = (result.sanitized_text_preview or "").strip()
    rebuilt_text = ""

    if full_text:
        sanitized_text = full_text
    else:
        # Backward compatibility: old scans may only have preview (truncated to 1200 chars).
        rebuilt_text = _rebuild_sanitized_from_source(scan)
        if rebuilt_text and len(rebuilt_text) > len(preview_text):
            sanitized_text = rebuilt_text
        else:
            sanitized_text = preview_text or rebuilt_text

    base_name = Path(scan.document.original_name if scan.document else f"scan-{scan.id}").stem
    if format == "md":
        markdown = _build_markdown_export(scan, result, sanitized_text)
        return Response(
            content=markdown,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{base_name}-sanitized.md"'},
        )
    if format == "json":
        payload = {
            "scan_id": scan.id,
            "document_id": scan.document_id,
            "file_name": scan.document.original_name if scan.document else None,
            "risk_level": (scan.risk_level or "unknown").upper(),
            "threat_score": scan.threat_score or 0,
            "technical_explanation": result.technical_explanation,
            "sanitized_text": sanitized_text,
            "evidences": [item.model_dump() for item in result.evidences],
        }
        return JSONResponse(
            content=payload,
            headers={"Content-Disposition": f'attachment; filename="{base_name}-sanitized.json"'},
        )
    return Response(
        content=sanitized_text,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{base_name}-sanitized.txt"'},
    )


@router.delete("/{scan_id}")
def delete_scan_report(
    scan_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    # Strict tenant-admin only (superadmin and other roles are not allowed here).
    if auth.role != str(UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only tenant admin can delete processed reports")

    scan = (
        db.query(ScanJob)
        .filter(ScanJob.id == scan_id, ScanJob.tenant_id == auth.tenant_id)
        .first()
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    document = scan.document
    rag_path = scan.rag_markdown_path
    storage_path = document.storage_path if document else None

    delete_document_record = False
    if document:
        siblings = (
            db.query(ScanJob)
            .filter(
                ScanJob.tenant_id == auth.tenant_id,
                ScanJob.document_id == document.id,
                ScanJob.id != scan.id,
            )
            .count()
        )
        delete_document_record = siblings == 0

    deleted_document_id = document.id if (document and delete_document_record) else None
    deleted_document_name = document.original_name if document else None

    db.delete(scan)
    if document and delete_document_record:
        db.delete(document)
    db.commit()

    if rag_path:
        try:
            path = Path(rag_path)
            if path.exists():
                path.unlink()
        except Exception:
            pass
    if storage_path and delete_document_record:
        try:
            path = Path(storage_path)
            if path.exists():
                path.unlink()
        except Exception:
            pass

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="scan.delete_report",
        resource_type="scan",
        resource_id=scan_id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "deleted_document_id": deleted_document_id,
            "deleted_document_name": deleted_document_name,
            "deleted_report_only": not bool(delete_document_record),
        },
    )

    return {"ok": True, "scan_id": scan_id}

