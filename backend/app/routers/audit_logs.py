import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogListResponse, AuditLogOut


router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    actor_user_id: str | None = Query(default=None),
    source_ip: str | None = Query(default=None),
    q: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog).filter(AuditLog.tenant_id == auth.tenant_id)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if resource_type:
        query = query.filter(AuditLog.resource_type.ilike(f"%{resource_type.strip()}%"))
    if actor_user_id:
        query = query.filter(AuditLog.actor_user_id == actor_user_id.strip())
    if source_ip:
        query = query.filter(AuditLog.source_ip.ilike(f"%{source_ip.strip()}%"))
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)
    if q and q.strip():
        term = q.strip()
        query = query.filter(
            or_(
                AuditLog.action.ilike(f"%{term}%"),
                AuditLog.resource_type.ilike(f"%{term}%"),
                AuditLog.details_json.ilike(f"%{term}%"),
                AuditLog.source_ip.ilike(f"%{term}%"),
            )
        )

    total = int(query.count())
    rows = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    actor_ids = {item.actor_user_id for item in rows if item.actor_user_id}
    user_map = {}
    if actor_ids:
        users = db.query(User.id, User.email).filter(User.id.in_(actor_ids)).all()
        user_map = {item[0]: item[1] for item in users}

    items: list[AuditLogOut] = []
    for item in rows:
        parsed_details: dict = {}
        if item.details_json:
            try:
                value = json.loads(item.details_json)
                if isinstance(value, dict):
                    parsed_details = value
            except Exception:
                parsed_details = {}

        items.append(
            AuditLogOut(
                id=item.id,
                created_at=item.created_at,
                tenant_id=item.tenant_id,
                actor_user_id=item.actor_user_id,
                actor_user_email=user_map.get(item.actor_user_id) if item.actor_user_id else None,
                actor_api_token_id=item.actor_api_token_id,
                action=item.action,
                resource_type=item.resource_type,
                resource_id=item.resource_id,
                source_ip=item.source_ip,
                details=parsed_details,
                details_json=item.details_json,
            )
        )

    return AuditLogListResponse(items=items, total=total, limit=limit, offset=offset)

