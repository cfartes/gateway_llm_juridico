from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.support_ticket import SupportTicket
from app.models.support_ticket_attachment import SupportTicketAttachment
from app.models.support_ticket_message import SupportTicketMessage
from app.services.file_validation import inspect_zip_for_blocked_files, validate_file_metadata
from app.services.webhook_delivery_service import send_ops_alert
from app.utils.common import ensure_dir, sha256_bytes


def create_support_ticket(
    db: Session,
    *,
    tenant_id: str,
    requester_user_id: str | None,
    subject: str,
    category: str,
    priority: str,
    description: str,
) -> SupportTicket:
    item = SupportTicket(
        tenant_id=tenant_id,
        requester_user_id=requester_user_id,
        subject=subject.strip(),
        category=category.strip().lower(),
        priority=priority.strip().lower(),
        description=description.strip(),
        status="open",
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    send_ops_alert(
        "support.ticket.created",
        {
            "tenant_id": tenant_id,
            "ticket_id": item.id,
            "priority": item.priority,
            "category": item.category,
            "subject": item.subject,
            "requester_user_id": requester_user_id,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        },
    )
    return item


def list_tenant_tickets(db: Session, *, tenant_id: str, limit: int = 100) -> list[SupportTicket]:
    capped = max(1, min(limit, 500))
    return (
        db.query(SupportTicket)
        .filter(SupportTicket.tenant_id == tenant_id)
        .order_by(SupportTicket.updated_at.desc())
        .limit(capped)
        .all()
    )


def list_support_tickets_for_superadmin(
    db: Session,
    *,
    status: str = "all",
    tenant_id: str | None = None,
    limit: int = 200,
) -> list[SupportTicket]:
    capped = max(1, min(limit, 500))
    query = db.query(SupportTicket)
    if status != "all":
        query = query.filter(SupportTicket.status == status)
    if tenant_id:
        query = query.filter(SupportTicket.tenant_id == tenant_id)
    return query.order_by(SupportTicket.updated_at.desc()).limit(capped).all()


def update_support_ticket_status(
    db: Session,
    *,
    ticket: SupportTicket,
    status: str,
    admin_note: str | None,
    assigned_to_user_id: str | None,
) -> SupportTicket:
    now = datetime.now(timezone.utc)
    previous_status = ticket.status
    ticket.status = status
    ticket.admin_note = admin_note.strip() if admin_note else None
    ticket.assigned_to_user_id = assigned_to_user_id

    if previous_status == "open" and status in {"in_progress", "resolved", "closed"} and not ticket.first_response_at:
        ticket.first_response_at = now
    if status in {"resolved", "closed"}:
        ticket.resolved_at = now
    elif status in {"open", "in_progress"}:
        ticket.resolved_at = None

    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    send_ops_alert(
        "support.ticket.updated",
        {
            "tenant_id": ticket.tenant_id,
            "ticket_id": ticket.id,
            "status": ticket.status,
            "priority": ticket.priority,
            "assigned_to_user_id": ticket.assigned_to_user_id,
            "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        },
    )
    return ticket


def list_ticket_messages(
    db: Session,
    *,
    ticket_id: str,
    include_internal: bool = False,
    limit: int = 500,
) -> list[SupportTicketMessage]:
    capped = max(1, min(limit, 2000))
    query = db.query(SupportTicketMessage).filter(SupportTicketMessage.ticket_id == ticket_id)
    if not include_internal:
        query = query.filter(SupportTicketMessage.is_internal.is_(False))
    return query.order_by(SupportTicketMessage.created_at.asc()).limit(capped).all()


def create_ticket_message(
    db: Session,
    *,
    ticket: SupportTicket,
    author_user_id: str | None,
    author_role: str,
    message: str,
    is_internal: bool = False,
) -> SupportTicketMessage:
    body = message.strip()
    if not body:
        raise ValueError("Message cannot be empty")

    item = SupportTicketMessage(
        ticket_id=ticket.id,
        tenant_id=ticket.tenant_id,
        author_user_id=author_user_id,
        author_role=author_role,
        message=body,
        is_internal=bool(is_internal),
    )
    db.add(item)

    # First response SLA: first non-internal superadmin message counts as first response.
    if author_role == "superadmin" and not is_internal and ticket.first_response_at is None:
        ticket.first_response_at = datetime.now(timezone.utc)
        db.add(ticket)

    db.commit()
    db.refresh(item)

    send_ops_alert(
        "support.ticket.message.created",
        {
            "tenant_id": ticket.tenant_id,
            "ticket_id": ticket.id,
            "message_id": item.id,
            "author_role": author_role,
            "is_internal": bool(is_internal),
        },
    )
    return item


def list_ticket_attachments(
    db: Session,
    *,
    ticket_id: str,
    include_internal: bool = False,
    limit: int = 500,
) -> list[SupportTicketAttachment]:
    capped = max(1, min(limit, 2000))
    query = db.query(SupportTicketAttachment).filter(SupportTicketAttachment.ticket_id == ticket_id)
    if not include_internal:
        query = query.filter(SupportTicketAttachment.is_internal.is_(False))
    return query.order_by(SupportTicketAttachment.created_at.asc()).limit(capped).all()


def _attachment_storage_path(tenant_id: str, ticket_id: str, filename: str) -> Path:
    ext = (Path(filename).suffix or ".bin").lower()
    root = Path("storage") / "support_attachments" / tenant_id / ticket_id
    ensure_dir(root)
    return root / f"{uuid4().hex}{ext}"


def create_ticket_attachment(
    db: Session,
    *,
    ticket: SupportTicket,
    uploaded_by_user_id: str | None,
    uploaded_by_role: str,
    filename: str,
    content_type: str | None,
    content: bytes,
    is_internal: bool = False,
) -> SupportTicketAttachment:
    safe_filename = filename or "attachment.bin"
    validate_file_metadata(safe_filename, content_type, len(content))
    if len(content) > max(1, int(settings.support_attachment_max_upload_mb)) * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Attachment too large for support ticket policy.")

    path = _attachment_storage_path(ticket.tenant_id, ticket.id, safe_filename)
    path.write_bytes(content)

    if path.suffix.lower() == ".zip":
        blocked = inspect_zip_for_blocked_files(path)
        if blocked:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=f"ZIP has blocked files: {blocked[:5]}")

    item = SupportTicketAttachment(
        ticket_id=ticket.id,
        tenant_id=ticket.tenant_id,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_by_role=uploaded_by_role,
        original_name=safe_filename,
        mime_type=(content_type or "application/octet-stream").strip() or "application/octet-stream",
        size_bytes=len(content),
        storage_path=str(path),
        sha256=sha256_bytes(content),
        is_internal=bool(is_internal),
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    send_ops_alert(
        "support.ticket.attachment.created",
        {
            "tenant_id": ticket.tenant_id,
            "ticket_id": ticket.id,
            "attachment_id": item.id,
            "uploaded_by_role": uploaded_by_role,
            "is_internal": bool(is_internal),
            "size_bytes": int(item.size_bytes),
        },
    )
    return item


def resolve_attachment_file(attachment: SupportTicketAttachment) -> Path:
    path = Path(attachment.storage_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found")
    return path
