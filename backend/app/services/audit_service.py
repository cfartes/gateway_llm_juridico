from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.utils.common import compact_json


def write_audit_log(
    db: Session,
    *,
    tenant_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None,
    actor_user_id: str | None,
    actor_api_token_id: str | None,
    source_ip: str | None,
    details: dict | None = None,
) -> None:
    entry = AuditLog(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_api_token_id=actor_api_token_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        source_ip=source_ip,
        details_json=compact_json(details or {}),
    )
    db.add(entry)
    db.commit()

