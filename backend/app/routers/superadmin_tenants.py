from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.api_token import APIToken
from app.models.document import Document
from app.models.scan_job import ScanJob
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.superadmin_tenant import SuperAdminTenantOut, SuperAdminTenantUpdateRequest
from app.services.audit_service import write_audit_log


router = APIRouter(prefix="/admin/tenants", tags=["superadmin-tenants"])


def _build_tenant_counts(db: Session, tenant_ids: list[str]) -> tuple[dict[str, int], dict[str, int], dict[str, int], dict[str, int]]:
    if not tenant_ids:
        return {}, {}, {}, {}

    users_count = defaultdict(int)
    docs_count = defaultdict(int)
    scans_count = defaultdict(int)
    tokens_count = defaultdict(int)

    for tenant_id, count in (
        db.query(User.tenant_id, func.count(User.id))
        .filter(User.tenant_id.in_(tenant_ids))
        .group_by(User.tenant_id)
        .all()
    ):
        users_count[str(tenant_id)] = int(count)

    for tenant_id, count in (
        db.query(Document.tenant_id, func.count(Document.id))
        .filter(Document.tenant_id.in_(tenant_ids))
        .group_by(Document.tenant_id)
        .all()
    ):
        docs_count[str(tenant_id)] = int(count)

    for tenant_id, count in (
        db.query(ScanJob.tenant_id, func.count(ScanJob.id))
        .filter(ScanJob.tenant_id.in_(tenant_ids))
        .group_by(ScanJob.tenant_id)
        .all()
    ):
        scans_count[str(tenant_id)] = int(count)

    for tenant_id, count in (
        db.query(APIToken.tenant_id, func.count(APIToken.id))
        .filter(APIToken.tenant_id.in_(tenant_ids), APIToken.revoked_at.is_(None))
        .group_by(APIToken.tenant_id)
        .all()
    ):
        tokens_count[str(tenant_id)] = int(count)

    return users_count, docs_count, scans_count, tokens_count


def _to_out(
    tenant: Tenant,
    users_count: dict[str, int],
    docs_count: dict[str, int],
    scans_count: dict[str, int],
    tokens_count: dict[str, int],
) -> SuperAdminTenantOut:
    tenant_id = str(tenant.id)
    return SuperAdminTenantOut(
        id=tenant_id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        plan=tenant.plan,
        created_at=tenant.created_at,
        total_users=int(users_count.get(tenant_id, 0)),
        total_documents=int(docs_count.get(tenant_id, 0)),
        total_scans=int(scans_count.get(tenant_id, 0)),
        active_api_tokens=int(tokens_count.get(tenant_id, 0)),
    )


@router.get("", response_model=list[SuperAdminTenantOut])
def list_tenants(
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    ids = [tenant.id for tenant in tenants]
    users_count, docs_count, scans_count, tokens_count = _build_tenant_counts(db, ids)
    return [_to_out(tenant, users_count, docs_count, scans_count, tokens_count) for tenant in tenants]


@router.get("/{tenant_id}", response_model=SuperAdminTenantOut)
def get_tenant(
    tenant_id: str,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    users_count, docs_count, scans_count, tokens_count = _build_tenant_counts(db, [tenant.id])
    return _to_out(tenant, users_count, docs_count, scans_count, tokens_count)


@router.patch("/{tenant_id}", response_model=SuperAdminTenantOut)
def update_tenant(
    tenant_id: str,
    payload: SuperAdminTenantUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    if payload.is_active is None and payload.plan is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if payload.is_active is not None:
        tenant.is_active = payload.is_active
    if payload.plan is not None:
        tenant.plan = payload.plan

    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.tenant.update",
        resource_type="tenant",
        resource_id=tenant.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"target_tenant_id": tenant.id, "plan": str(tenant.plan), "is_active": tenant.is_active},
    )

    users_count, docs_count, scans_count, tokens_count = _build_tenant_counts(db, [tenant.id])
    return _to_out(tenant, users_count, docs_count, scans_count, tokens_count)
