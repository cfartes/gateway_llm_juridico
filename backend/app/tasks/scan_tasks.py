import json
from uuid import uuid4
from pathlib import Path

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.types import ScanStatus
from app.models.scan_job import ScanJob
from app.schemas.analyze_gateway import AnalyzeReturnMode
from app.pipelines.analysis_graph import analyze_document_bytes
from app.services.policy_enforcement import decide_policy_action, quarantine_status_from_action
from app.services.analyze_gateway_service import (
    format_analyze_payload,
    generate_rag_markdown,
    parse_integration_meta,
    trigger_result_webhook,
)
from app.services.webhook_delivery_service import persist_webhook_delivery_result
from app.services.webhook_delivery_service import discard_exhausted_dead_letters, list_dead_letter_retry_candidates, retry_delivery_now
from app.services.ops_alerting_service import cleanup_old_slo_snapshots, evaluate_slo_alerts
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
        policy = decide_policy_action(result)

        scan_job.status = ScanStatus.COMPLETED
        scan_job.threat_score = result.threat_score
        scan_job.risk_level = result.risk_level
        scan_job.summary = result.technical_explanation
        scan_job.result_json = encrypt_text(json.dumps(result.model_dump(), ensure_ascii=False))
        scan_job.policy_action = policy.action
        scan_job.policy_reason = policy.reason
        scan_job.quarantine_status = quarantine_status_from_action(policy.action)
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
        scan_job.policy_action = policy.action
        scan_job.policy_reason = policy.reason
        scan_job.quarantine_status = quarantine_status_from_action(policy.action)
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
                "event_id": str(uuid4()),
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
                extra_headers={"X-Nexus-Event-Id": webhook_payload["event_id"]},
            )
            persist_webhook_delivery_result(
                db,
                scan_job=scan_job,
                callback_url=str(callback_url),
                payload=webhook_payload,
                callback_secret=metadata.get("callback_secret"),
                callback_auth_bearer=metadata.get("callback_auth_bearer"),
                max_attempts=settings.webhook_callback_max_retries,
                delivery_result=delivery,
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


@celery_app.task(name="retry_dead_letter_webhooks_task")
def retry_dead_letter_webhooks_task() -> dict:
    if not settings.webhook_dead_letter_auto_retry_enabled:
        return {"status": "disabled"}

    db = SessionLocal()
    retried = 0
    delivered = 0
    still_dead_letter = 0
    exhausted_discarded = 0
    try:
        exhausted_discarded = discard_exhausted_dead_letters(
            db,
            max_total_attempts=settings.webhook_dead_letter_auto_retry_max_total_attempts,
        )
        candidates = list_dead_letter_retry_candidates(
            db,
            min_age_seconds=settings.webhook_dead_letter_auto_retry_min_age_seconds,
            batch_size=settings.webhook_dead_letter_auto_retry_batch_size,
            max_total_attempts=settings.webhook_dead_letter_auto_retry_max_total_attempts,
        )
        for delivery in candidates:
            try:
                updated, _attempts = retry_delivery_now(
                    db,
                    delivery=delivery,
                    timeout_seconds=settings.webhook_callback_timeout_seconds,
                    max_retries=settings.webhook_callback_max_retries,
                    base_backoff_seconds=settings.webhook_callback_backoff_seconds,
                )
                retried += 1
                if updated.status == "delivered":
                    delivered += 1
                else:
                    still_dead_letter += 1
            except Exception:
                still_dead_letter += 1
                continue

        return {
            "status": "ok",
            "retried": retried,
            "delivered": delivered,
            "still_dead_letter": still_dead_letter,
            "exhausted_discarded": exhausted_discarded,
        }
    finally:
        db.close()


@celery_app.task(name="evaluate_ops_slo_alerts_task")
def evaluate_ops_slo_alerts_task() -> dict:
    db = SessionLocal()
    try:
        return evaluate_slo_alerts(
            db,
            scope_key="global",
            tenant_id=None,
            window_hours=int(settings.ops_slo_alert_window_hours),
        )
    finally:
        db.close()


@celery_app.task(name="cleanup_ops_slo_snapshots_task")
def cleanup_ops_slo_snapshots_task() -> dict:
    db = SessionLocal()
    try:
        deleted = cleanup_old_slo_snapshots(
            db,
            retention_days=int(settings.ops_slo_snapshot_retention_days),
        )
        return {
            "status": "ok",
            "retention_days": int(settings.ops_slo_snapshot_retention_days),
            "deleted": deleted,
        }
    finally:
        db.close()

