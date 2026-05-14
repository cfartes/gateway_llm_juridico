from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import api


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

app.include_router(api.router, prefix=settings.api_v1_prefix)


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "api": settings.api_v1_prefix,
    }

