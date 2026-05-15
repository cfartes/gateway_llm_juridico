from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.queue_alert_preference import QueueAlertPreference


def get_or_create_preference(db: Session, *, user_id: str, scope: str, scope_key: str) -> QueueAlertPreference:
    pref = (
        db.query(QueueAlertPreference)
        .filter(
            QueueAlertPreference.user_id == user_id,
            QueueAlertPreference.scope == scope,
            QueueAlertPreference.scope_key == scope_key,
        )
        .first()
    )
    if pref:
        return pref

    pref = QueueAlertPreference(
        user_id=user_id,
        scope=scope,
        scope_key=scope_key,
    )
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


def update_preference(
    db: Session,
    *,
    pref: QueueAlertPreference,
    snooze_minutes: int | None = None,
    clear_snooze: bool = False,
    acknowledged_signature: str | None = None,
) -> QueueAlertPreference:
    changed = False
    now = datetime.now(timezone.utc)
    if clear_snooze:
        pref.snooze_until = None
        changed = True
    elif snooze_minutes is not None:
        pref.snooze_until = now + timedelta(minutes=max(1, int(snooze_minutes)))
        changed = True

    if acknowledged_signature is not None:
        signature = acknowledged_signature.strip()
        pref.acknowledged_signature = signature or None
        changed = True

    if changed:
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref
