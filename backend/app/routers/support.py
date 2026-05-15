from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.support_ticket import SupportTicket
from app.schemas.support_ticket import SupportTicketCreateRequest, SupportTicketOut
from app.services.audit_service import write_audit_log
from app.services.support_ticket_service import create_support_ticket, list_tenant_tickets


router = APIRouter(prefix="/support/tickets", tags=["support"])


@router.get("", response_model=list[SupportTicketOut])
def list_current_tenant_tickets(
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return list_tenant_tickets(db, tenant_id=auth.tenant_id)


@router.post("", response_model=SupportTicketOut)
def open_ticket(
    payload: SupportTicketCreateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    item = create_support_ticket(
        db,
        tenant_id=auth.tenant_id,
        requester_user_id=auth.user_id,
        subject=payload.subject,
        category=payload.category,
        priority=payload.priority,
        description=payload.description,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="support.ticket.create",
        resource_type="support_ticket",
        resource_id=item.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"priority": item.priority, "category": item.category, "subject": item.subject},
    )
    return item


@router.get("/{ticket_id}", response_model=SupportTicketOut)
def get_ticket(
    ticket_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.tenant_id == auth.tenant_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return item
