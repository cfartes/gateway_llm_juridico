from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.support_ticket import SupportTicket
from app.models.support_ticket_message import SupportTicketMessage
from app.services.webhook_delivery_service import send_ops_alert


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
