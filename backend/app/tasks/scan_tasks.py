import json
from pathlib import Path

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.types import ScanStatus
from app.models.scan_job import ScanJob
from app.schemas.analyze_gateway import AnalyzeReturnMode
from app.pipelines.analysis_graph import analyze_document_bytes
from app.services.policy_enforcement import decide_policy_action
from app.services.analyze_gateway_service import (
    format_analyze_payload,
    generate_rag_markdown,
    parse_integration_meta,
    trigger_result_webhook,
)
from app.tasks.celery_app import celery_app
from app.utils.crypto import encrypt_text


@celery_app.task(name="scan_document_task")
def scan_document_task(scan_job_id: str, file_path: str) -> dict:
    db = SessionLocal()
    try:
        scan_job = db.query(ScanJob).filter(ScanJob.id == scan_job_id).first()
        if not scan_job:
            return {"error": "scan job not found"}

        scan_job.status = ScanStatus.RUNNING
        db.add(scan_job)
        db.commit()

        content = Path(file_path).read_bytes()
        result = analyze_document_bytes(Path(file_path).name, content)

        scan_job.status = ScanStatus.COMPLETED
        scan_job.threat_score = result.threat_score
        scan_job.risk_level = result.risk_level
        scan_job.summary = result.technical_explanation
        scan_job.result_json = encrypt_text(json.dumps(result.model_dump(), ensure_ascii=False))
        db.add(scan_job)
        db.commit()

        return {"scan_job_id": scan_job_id, "status": "completed"}
    except Exception as exc:
        scan_job = db.query(ScanJob).filter(ScanJob.id == scan_job_id).first()
        if scan_job:
            scan_job.status = ScanStatus.FAILED
            scan_job.error_message = str(exc)
            db.add(scan_job)
            db.commit()
        return {"scan_job_id": scan_job_id, "status": "failed", "error": str(exc)}
    finally:
        db.close()


@celery_app.task(name="analyze_gateway_task")
def analyze_gateway_task(scan_job_id: str, file_path: str) -> dict:
    db = SessionLocal()
    try:
        scan_job = db.query(ScanJob).filter(ScanJob.id == scan_job_id).first()
        if not scan_job:
            return {"error": "scan job not found"}

        scan_job.status = ScanStatus.RUNNING
        db.add(scan_job)
        db.commit()

        content = Path(file_path).read_bytes()
        result = analyze_document_bytes(Path(file_path).name, content)
        policy = decide_policy_action(result)

        rag_path = None
        chunks = []
        metadata = parse_integration_meta(scan_job)
        generate_rag = bool(metadata.get("generate_rag_md"))
        if generate_rag and policy.safe_for_rag:
            rag_path, chunks = generate_rag_markdown(scan_job.document, result)

        scan_job.status = ScanStatus.COMPLETED
        scan_job.threat_score = result.threat_score
        scan_job.risk_level = result.risk_level
        scan_job.summary = result.technical_explanation
        scan_job.result_json = encrypt_text(json.dumps(result.model_dump(), ensure_ascii=False))
        scan_job.rag_markdown_path = rag_path
        db.add(scan_job)
        db.commit()
        db.refresh(scan_job)

        callback_url = metadata.get("callback_url")
        return_mode_raw = metadata.get("return_mode", "full_report")
        try:
            return_mode = AnalyzeReturnMode(return_mode_raw)
        except Exception:
            return_mode = AnalyzeReturnMode.FULL_REPORT

        if callback_url:
            rag_markdown = None
            rag_markdown_url = None
            if rag_path:
                try:
                    rag_markdown = Path(rag_path).read_text(encoding="utf-8")
                    rag_markdown_url = f"/api/v1/files/{scan_job.document_id}/rag-md"
                except Exception:
                    rag_markdown = None

            payload = format_analyze_payload(
                result=result,
                return_mode=return_mode,
                rag_markdown=rag_markdown,
                rag_markdown_url=rag_markdown_url,
                chunks=chunks,
            ).model_dump()
            webhook_payload = {
                "job_id": scan_job.id,
                "file_id": scan_job.document_id,
                "status": str(scan_job.status).lower(),
                "result": payload,
                "external_reference": metadata.get("external_reference"),
            }
            delivery = trigger_result_webhook(
                str(callback_url),
                webhook_payload,
                callback_secret=metadata.get("callback_secret"),
                callback_auth_bearer=metadata.get("callback_auth_bearer"),
                timeout_seconds=settings.webhook_callback_timeout_seconds,
                max_retries=settings.webhook_callback_max_retries,
                base_backoff_seconds=settings.webhook_callback_backoff_seconds,
            )
            if not delivery.get("ok"):
                scan_job.error_message = (
                    f"Webhook callback delivery failed after {delivery.get('attempt')} attempts: "
                    f"{delivery.get('error') or delivery.get('status_code')}"
                )
                db.add(scan_job)
                db.commit()

        return {"scan_job_id": scan_job_id, "status": "completed"}
    except Exception as exc:
        scan_job = db.query(ScanJob).filter(ScanJob.id == scan_job_id).first()
        if scan_job:
            scan_job.status = ScanStatus.FAILED
            scan_job.error_message = str(exc)
            db.add(scan_job)
            db.commit()
        return {"scan_job_id": scan_job_id, "status": "failed", "error": str(exc)}
    finally:
        db.close()

