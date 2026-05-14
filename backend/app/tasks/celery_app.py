from celery import Celery
from kombu import Exchange, Queue

from app.core.config import settings


celery_app = Celery(
    "nexus_llm_shield",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.scan_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_default_exchange="scan",
    task_default_exchange_type="direct",
    task_default_queue="scan_standard",
    task_default_routing_key="scan_standard",
    task_create_missing_queues=True,
    task_queues=(
        Queue("scan_light", Exchange("scan", type="direct"), routing_key="scan_light"),
        Queue("scan_standard", Exchange("scan", type="direct"), routing_key="scan_standard"),
        Queue("scan_heavy", Exchange("scan", type="direct"), routing_key="scan_heavy"),
        Queue("celery", Exchange("celery", type="direct"), routing_key="celery"),
    ),
)

