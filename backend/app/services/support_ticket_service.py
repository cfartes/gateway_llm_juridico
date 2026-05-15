from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.support_ticket import SupportTicket
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
