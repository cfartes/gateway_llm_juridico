from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.types import UserRole
from app.schemas.ops_observability import OpsAlertEvaluationOut, OpsOverviewOut
from app.services.ops_alerting_service import evaluate_slo_alerts, list_active_alert_states
from app.services.ops_observability_service import build_ops_overview


router = APIRouter(prefix="/admin/ops", tags=["superadmin-ops"])


@router.get("/overview", response_model=OpsOverviewOut)
def get_ops_overview(
    window_hours: int = Query(default=24, ge=1, le=168),
    tenant_id: str | None = Query(default=None),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    payload = build_ops_overview(db, window_hours=window_hours, tenant_id=tenant_id)
    scope_key = f"tenant:{tenant_id}" if tenant_id else "global"
    payload["active_alerts"] = [
        {
            "scope_key": item.scope_key,
            "indicator_name": item.indicator_name,
            "status": item.last_status,
            "actual": float(item.last_actual),
            "target": float(item.target),
            "unit": item.unit,
            "alert_count": int(item.alert_count),
            "last_sent_at": item.last_sent_at,
            "updated_at": item.updated_at,
        }
        for item in list_active_alert_states(db, scope_key=scope_key)
    ]
    return OpsOverviewOut.model_validate(payload)


@router.post("/alerts/evaluate", response_model=OpsAlertEvaluationOut)
def run_ops_alert_evaluation(
    window_hours: int = Query(default=24, ge=1, le=168),
    tenant_id: str | None = Query(default=None),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    scope_key = f"tenant:{tenant_id}" if tenant_id else "global"
    payload = evaluate_slo_alerts(db, scope_key=scope_key, tenant_id=tenant_id, window_hours=window_hours)
    return OpsAlertEvaluationOut.model_validate(payload)
