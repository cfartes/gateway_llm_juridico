from fastapi import APIRouter

from app.routers import auth, scans, tenants, tokens, uploads


router = APIRouter()


@router.get("/health", tags=["system"])
def health_check():
    return {"status": "healthy", "service": "nexus-llm-shield"}


router.include_router(auth.router)
router.include_router(tokens.router)
router.include_router(tenants.router)
router.include_router(uploads.router)
router.include_router(scans.router)

