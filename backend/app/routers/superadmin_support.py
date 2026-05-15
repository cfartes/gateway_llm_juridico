from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.support_ticket import SupportTicket
from app.schemas.support_ticket import SupportTicketOut, SupportTicketStatusUpdateRequest
from app.services.audit_service import write_audit_log
from app.services.support_ticket_service import list_support_tickets_for_superadmin, update_support_ticket_status


router = APIRouter(prefix="/admin/support/tickets", tags=["superadmin-support"])


@router.get("", response_model=list[SupportTicketOut])
def list_support_tickets(
    status: str = Query(default="all"),
    tenant_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    return list_support_tickets_for_superadmin(db, status=status, tenant_id=tenant_id, limit=limit)


@router.patch("/{ticket_id}", response_model=SupportTicketOut)
def update_ticket_status(
    ticket_id: str,
    payload: SupportTicketStatusUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")

    updated = update_support_ticket_status(
        db,
        ticket=item,
        status=payload.status,
        admin_note=payload.admin_note,
        assigned_to_user_id=payload.assigned_to_user_id,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.support.ticket.update",
        resource_type="support_ticket",
        resource_id=updated.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "target_tenant_id": updated.tenant_id,
            "status": updated.status,
            "priority": updated.priority,
        },
    )
    return updated
