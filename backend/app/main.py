from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.middleware import EnforceHTTPSMiddleware, SecurityHeadersMiddleware
from app.routers import api
from app.services.superadmin_service import ensure_superadmin_account


Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Nexus LLM Shield API",
    description="Enterprise SaaS for Prompt Injection Detection in documents.",
    version=settings.version,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[host.strip() for host in settings.allowed_hosts.split(",") if host.strip()],
)
app.add_middleware(EnforceHTTPSMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(api.router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def startup_bootstrap_superadmin() -> None:
    if not settings.superadmin_auto_bootstrap:
        return
    db = SessionLocal()
    try:
        ensure_superadmin_account(db)
    finally:
        db.close()


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "api": settings.api_v1_prefix,
    }

