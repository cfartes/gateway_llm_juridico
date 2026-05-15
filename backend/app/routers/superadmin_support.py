from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.support_ticket import SupportTicket
from app.schemas.support_ticket import SupportTicketAttachmentOut, SupportTicketMessageCreateRequest, SupportTicketMessageOut, SupportTicketOut, SupportTicketStatusUpdateRequest
from app.services.audit_service import write_audit_log
from app.services.support_ticket_service import (
    create_ticket_attachment,
    create_ticket_message,
    list_support_tickets_for_superadmin,
    list_ticket_attachments,
    list_ticket_messages,
    resolve_attachment_file,
    update_support_ticket_status,
)


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


@router.get("/{ticket_id}/messages", response_model=list[SupportTicketMessageOut])
def list_ticket_messages_admin(
    ticket_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return list_ticket_messages(db, ticket_id=item.id, include_internal=True)


@router.post("/{ticket_id}/messages", response_model=SupportTicketMessageOut)
def create_ticket_message_admin(
    ticket_id: str,
    payload: SupportTicketMessageCreateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")

    created = create_ticket_message(
        db,
        ticket=item,
        author_user_id=auth.user_id,
        author_role="superadmin",
        message=payload.message,
        is_internal=payload.is_internal,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.support.ticket.message.create",
        resource_type="support_ticket_message",
        resource_id=created.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"ticket_id": item.id, "is_internal": bool(payload.is_internal)},
    )
    return created


@router.get("/{ticket_id}/attachments", response_model=list[SupportTicketAttachmentOut])
def list_ticket_attachments_admin(
    ticket_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    item = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return list_ticket_attachments(db, ticket_id=item.id, include_internal=True)


@router.post("/{ticket_id}/attachments", response_model=SupportTicketAttachmentOut)
async def upload_ticket_attachment_admin(
    ticket_id: str,
    request: Request,
    file: UploadFile = File(...),
    is_internal: bool = Form(default=False),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    content = await file.read()
    item = create_ticket_attachment(
        db,
        ticket=ticket,
        uploaded_by_user_id=auth.user_id,
        uploaded_by_role="superadmin",
        filename=file.filename or "attachment.bin",
        content_type=file.content_type,
        content=content,
        is_internal=bool(is_internal),
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.support.ticket.attachment.create",
        resource_type="support_ticket_attachment",
        resource_id=item.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"ticket_id": ticket.id, "is_internal": bool(item.is_internal), "filename": item.original_name},
    )
    return item


@router.get("/{ticket_id}/attachments/{attachment_id}/download")
def download_ticket_attachment_admin(
    ticket_id: str,
    attachment_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    from app.models.support_ticket_attachment import SupportTicketAttachment

    attachment = (
        db.query(SupportTicketAttachment)
        .filter(
            SupportTicketAttachment.id == attachment_id,
            SupportTicketAttachment.ticket_id == ticket.id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = resolve_attachment_file(attachment)
    return FileResponse(path=str(path), media_type=attachment.mime_type, filename=attachment.original_name)
