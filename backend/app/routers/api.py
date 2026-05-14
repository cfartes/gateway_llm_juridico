from fastapi import APIRouter

from app.routers import analyze, auth, llm_admin, quarantine, scans, tenants, tokens, uploads


router = APIRouter()


@router.get("/health", tags=["system"])
def health_check():
    return {"status": "healthy", "service": "nexus-llm-shield"}


router.include_router(auth.router)
router.include_router(tokens.router)
router.include_router(tenants.router)
router.include_router(uploads.router)
router.include_router(scans.router)
router.include_router(quarantine.router)
router.include_router(llm_admin.router)
router.include_router(analyze.analyze_router)
router.include_router(analyze.files_router)
router.include_router(analyze.webhook_router)

