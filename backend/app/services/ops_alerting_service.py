from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ops_alert_state import OpsAlertState
from app.models.ops_slo_snapshot import OpsSLOSnapshot
from app.services.ops_observability_service import build_ops_overview
from app.services.webhook_delivery_service import send_ops_alert


def list_active_alert_states(db: Session, *, scope_key: str = "global") -> list[OpsAlertState]:
    return (
        db.query(OpsAlertState)
        .filter(OpsAlertState.scope_key == scope_key, OpsAlertState.last_status.in_(["warn", "fail"]))
        .order_by(OpsAlertState.updated_at.desc())
        .all()
    )


def _get_or_create_state(db: Session, *, scope_key: str, indicator_name: str) -> OpsAlertState:
    state = (
        db.query(OpsAlertState)
        .filter(OpsAlertState.scope_key == scope_key, OpsAlertState.indicator_name == indicator_name)
        .first()
    )
    if state:
        return state

    state = OpsAlertState(scope_key=scope_key, indicator_name=indicator_name)
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def _is_cooldown_elapsed(last_sent_at: datetime | None) -> bool:
    if not last_sent_at:
        return True
    cooldown = max(0, int(settings.ops_alert_cooldown_seconds))
    elapsed = (datetime.now(timezone.utc) - last_sent_at).total_seconds()
    return elapsed >= cooldown


def list_slo_history(
    db: Session,
    *,
    scope_key: str = "global",
    window_hours: int = 24,
    limit_per_indicator: int = 30,
) -> list[OpsSLOSnapshot]:
    window = max(1, min(window_hours, 168))
    per_indicator = max(1, min(limit_per_indicator, 200))
    since = datetime.now(timezone.utc) - timedelta(hours=window)
    rows = (
        db.query(OpsSLOSnapshot)
        .filter(OpsSLOSnapshot.scope_key == scope_key, OpsSLOSnapshot.recorded_at >= since)
        .order_by(OpsSLOSnapshot.indicator_name.asc(), OpsSLOSnapshot.recorded_at.desc())
        .all()
    )

    picked: list[OpsSLOSnapshot] = []
    counters: dict[str, int] = {}
    for row in rows:
        current = int(counters.get(row.indicator_name, 0))
        if current >= per_indicator:
            continue
        counters[row.indicator_name] = current + 1
        picked.append(row)

    picked.sort(key=lambda item: item.recorded_at, reverse=True)
    return picked


def cleanup_old_slo_snapshots(db: Session, *, retention_days: int) -> int:
    days = max(1, retention_days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    deleted = (
        db.query(OpsSLOSnapshot)
        .filter(OpsSLOSnapshot.recorded_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


def evaluate_slo_alerts(
    db: Session,
    *,
    scope_key: str = "global",
    tenant_id: str | None = None,
    window_hours: int | None = None,
) -> dict[str, Any]:
    window = window_hours or int(settings.ops_slo_alert_window_hours)
    overview = build_ops_overview(db, window_hours=window, tenant_id=tenant_id)
    slo_items = overview.get("slo", [])
    recorded_at = datetime.now(timezone.utc)

    breaches_sent = 0
    recoveries_sent = 0
    updated_items = 0

    for item in slo_items:
        name = str(item.get("name"))
        status = str(item.get("status") or "pass")
        actual = float(item.get("actual") or 0.0)
        target = float(item.get("target") or 0.0)
        unit = str(item.get("unit") or "count")
        signature = f"{status}|{round(actual, 2)}|{round(target, 2)}|{unit}"
        db.add(
            OpsSLOSnapshot(
                scope_key=scope_key,
                indicator_name=name,
                status=status,
                actual=actual,
                target=target,
                unit=unit,
                window_hours=window,
                recorded_at=recorded_at,
            )
        )

        state = _get_or_create_state(db, scope_key=scope_key, indicator_name=name)
        prev_status = state.last_status or "pass"

        should_send_breach = False
        should_send_recovery = False

        if status in {"warn", "fail"}:
            if prev_status == "pass":
                should_send_breach = True
            elif prev_status != status:
                should_send_breach = True
            elif _is_cooldown_elapsed(state.last_sent_at):
                should_send_breach = True
        elif status == "pass" and prev_status in {"warn", "fail"}:
            should_send_recovery = True

        if should_send_breach:
            send_ops_alert(
                "ops.slo.breach",
                {
                    "scope_key": scope_key,
                    "tenant_id": tenant_id,
                    "indicator_name": name,
                    "status": status,
                    "actual": round(actual, 2),
                    "target": round(target, 2),
                    "unit": unit,
                    "window_hours": window,
                },
            )
            state.last_sent_at = datetime.now(timezone.utc)
            state.alert_count = int(state.alert_count or 0) + 1
            state.resolved_at = None
            breaches_sent += 1

        if should_send_recovery:
            send_ops_alert(
                "ops.slo.recovered",
                {
                    "scope_key": scope_key,
                    "tenant_id": tenant_id,
                    "indicator_name": name,
                    "actual": round(actual, 2),
                    "target": round(target, 2),
                    "unit": unit,
                    "window_hours": window,
                },
            )
            state.resolved_at = datetime.now(timezone.utc)
            state.last_sent_at = datetime.now(timezone.utc)
            recoveries_sent += 1

        state.last_status = status
        state.last_actual = actual
        state.target = target
        state.unit = unit
        state.last_signature = signature
        db.add(state)
        updated_items += 1

    db.commit()
    return {
        "scope_key": scope_key,
        "window_hours": window,
        "updated_items": updated_items,
        "breaches_sent": breaches_sent,
        "recoveries_sent": recoveries_sent,
    }
