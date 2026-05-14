import json
from pathlib import Path

from app.core.database import SessionLocal
from app.core.types import ScanStatus
from app.models.scan_job import ScanJob
from app.pipelines.analysis_graph import analyze_document_bytes
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

