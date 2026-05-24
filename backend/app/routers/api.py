from fastapi import APIRouter

from app.routers import (
    analyze,
    audit_logs,
    auth,
    cnpj_validation,
    integrations,
    llm_admin,
    quarantine,
    queues,
    scans,
    settings,
    superadmin_ops,
    superadmin_support,
    superadmin_tenants,
    superadmin_webhooks,
    support,
    tenants,
    tokens,
    uploads,
    users,
    webhooks,
)


router = APIRouter()


@router.get("/health", tags=["system"])
def health_check():
    return {"status": "healthy", "service": "nexus-gateway-llm-shield"}


router.include_router(auth.router)
router.include_router(audit_logs.router)
router.include_router(tokens.router)
router.include_router(users.router)
router.include_router(integrations.router)
router.include_router(settings.router)
router.include_router(tenants.router)
router.include_router(uploads.router)
router.include_router(scans.router)
router.include_router(quarantine.router)
router.include_router(llm_admin.router)
router.include_router(superadmin_tenants.router)
router.include_router(superadmin_ops.router)
router.include_router(superadmin_support.router)
router.include_router(superadmin_webhooks.router)
router.include_router(queues.admin_router)
router.include_router(analyze.analyze_router)
router.include_router(analyze.files_router)
router.include_router(analyze.webhook_router)
router.include_router(webhooks.router)
router.include_router(queues.router)
router.include_router(support.router)
router.include_router(cnpj_validation.router)

