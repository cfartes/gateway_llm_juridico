from datetime import datetime, timezone
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.global_crawl_settings import GlobalCrawlSettings
from app.schemas.app_settings import CrawlSettingsOut, CrawlSettingsUpdateRequest


@dataclass
class CrawlRuntimeConfig:
    internal_links_enabled: bool
    max_pages: int
    max_depth: int
    timeout_seconds: float
    source: str


def _ensure_global_crawl_settings(db: Session) -> GlobalCrawlSettings:
    row = db.query(GlobalCrawlSettings).filter(GlobalCrawlSettings.singleton_key == "global").first()
    if row:
        return row
    now = datetime.now(timezone.utc)
    row = GlobalCrawlSettings(singleton_key="global", created_at=now, updated_at=now)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_crawl_settings(db: Session) -> CrawlSettingsOut:
    row = _ensure_global_crawl_settings(db)
    return CrawlSettingsOut(
        internal_links_enabled=bool(row.internal_links_enabled),
        max_pages=max(1, int(row.max_pages or 40)),
        max_depth=max(0, int(row.max_depth or 3)),
        timeout_seconds=max(5.0, float(row.timeout_seconds or 90.0)),
        source="database",
    )


def update_crawl_settings(db: Session, payload: CrawlSettingsUpdateRequest) -> CrawlSettingsOut:
    row = _ensure_global_crawl_settings(db)
    row.internal_links_enabled = bool(payload.internal_links_enabled)
    row.max_pages = max(1, int(payload.max_pages))
    row.max_depth = max(0, int(payload.max_depth))
    row.timeout_seconds = max(5.0, float(payload.timeout_seconds))
    db.add(row)
    db.commit()
    db.refresh(row)
    return get_crawl_settings(db)


def _resolve_runtime_from_db(db: Session) -> CrawlRuntimeConfig:
    row = db.query(GlobalCrawlSettings).filter(GlobalCrawlSettings.singleton_key == "global").first()
    if not row:
        raise ValueError("crawl settings not found")
    return CrawlRuntimeConfig(
        internal_links_enabled=bool(row.internal_links_enabled),
        max_pages=max(1, int(row.max_pages or 40)),
        max_depth=max(0, int(row.max_depth or 3)),
        timeout_seconds=max(5.0, float(row.timeout_seconds or 90.0)),
        source="database",
    )


def resolve_crawl_runtime_config() -> CrawlRuntimeConfig:
    db = SessionLocal()
    try:
        try:
            return _resolve_runtime_from_db(db)
        except Exception:
            pass
    finally:
        db.close()

    return CrawlRuntimeConfig(
        internal_links_enabled=bool(settings.url_crawl_internal_links_enabled),
        max_pages=max(1, int(settings.url_crawl_max_pages)),
        max_depth=max(0, int(settings.url_crawl_max_depth)),
        timeout_seconds=max(5.0, float(settings.url_crawl_timeout_seconds)),
        source="env_fallback",
    )
