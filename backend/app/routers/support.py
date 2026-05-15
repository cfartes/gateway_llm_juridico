from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.support_ticket import SupportTicket
from app.schemas.support_ticket import (
    SupportTicketAttachmentOut,
    SupportTicketCreateRequest,
    SupportTicketMessageCreateRequest,
    SupportTicketMessageOut,
    SupportTicketOut,
)
from app.services.audit_service import write_audit_log
from app.services.support_ticket_service import (
    create_support_ticket,
    create_ticket_attachment,
    create_ticket_message,
    list_tenant_tickets,
    list_ticket_attachments,
    list_ticket_messages,
    resolve_attachment_file,
)


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


@router.get("/{ticket_id}/messages", response_model=list[SupportTicketMessageOut])
def list_ticket_thread(
    ticket_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.tenant_id == auth.tenant_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return list_ticket_messages(db, ticket_id=item.id, include_internal=False)


@router.post("/{ticket_id}/messages", response_model=SupportTicketMessageOut)
def post_ticket_message(
    ticket_id: str,
    payload: SupportTicketMessageCreateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.tenant_id == auth.tenant_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    created = create_ticket_message(
        db,
        ticket=item,
        author_user_id=auth.user_id,
        author_role=str(auth.role),
        message=payload.message,
        is_internal=False,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="support.ticket.message.create",
        resource_type="support_ticket_message",
        resource_id=created.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"ticket_id": item.id},
    )
    return created


@router.get("/{ticket_id}/attachments", response_model=list[SupportTicketAttachmentOut])
def list_ticket_attachments_tenant(
    ticket_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.tenant_id == auth.tenant_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return list_ticket_attachments(db, ticket_id=ticket.id, include_internal=False)


@router.post("/{ticket_id}/attachments", response_model=SupportTicketAttachmentOut)
async def upload_ticket_attachment_tenant(
    ticket_id: str,
    request: Request,
    file: UploadFile = File(...),
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.tenant_id == auth.tenant_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    content = await file.read()
    item = create_ticket_attachment(
        db,
        ticket=ticket,
        uploaded_by_user_id=auth.user_id,
        uploaded_by_role=str(auth.role),
        filename=file.filename or "attachment.bin",
        content_type=file.content_type,
        content=content,
        is_internal=False,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="support.ticket.attachment.create",
        resource_type="support_ticket_attachment",
        resource_id=item.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"ticket_id": ticket.id, "filename": item.original_name, "size_bytes": item.size_bytes},
    )
    return item


@router.get("/{ticket_id}/attachments/{attachment_id}/download")
def download_ticket_attachment_tenant(
    ticket_id: str,
    attachment_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.tenant_id == auth.tenant_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    from app.models.support_ticket_attachment import SupportTicketAttachment

    attachment = (
        db.query(SupportTicketAttachment)
        .filter(
            SupportTicketAttachment.id == attachment_id,
            SupportTicketAttachment.ticket_id == ticket.id,
            SupportTicketAttachment.tenant_id == auth.tenant_id,
            SupportTicketAttachment.is_internal.is_(False),
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = resolve_attachment_file(attachment)
    return FileResponse(path=str(path), media_type=attachment.mime_type, filename=attachment.original_name)
