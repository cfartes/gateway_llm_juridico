from datetime import datetime, timezone
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.global_smtp_settings import GlobalSMTPSettings
from app.schemas.app_settings import SMTPSettingsOut, SMTPSettingsUpdateRequest
from app.utils.crypto import decrypt_text, encrypt_text


@dataclass
class SMTPRuntimeConfig:
    enabled: bool
    host: str
    port: int
    username: str
    password: str
    from_email: str
    use_tls: bool
    use_ssl: bool
    timeout_seconds: float
    source: str


def _ensure_global_smtp_settings(db: Session) -> GlobalSMTPSettings:
    row = db.query(GlobalSMTPSettings).filter(GlobalSMTPSettings.singleton_key == "global").first()
    if row:
        return row
    now = datetime.now(timezone.utc)
    row = GlobalSMTPSettings(singleton_key="global", created_at=now, updated_at=now)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_smtp_settings(db: Session) -> SMTPSettingsOut:
    row = _ensure_global_smtp_settings(db)
    return SMTPSettingsOut(
        enabled=bool(row.enabled),
        host=row.host or "",
        port=int(row.port or 587),
        username=row.username or "",
        from_email=row.from_email or "",
        use_tls=bool(row.use_tls),
        use_ssl=bool(row.use_ssl),
        timeout_seconds=float(row.timeout_seconds or 10.0),
        password_configured=bool(row.password_encrypted),
        source="database",
    )


def update_smtp_settings(db: Session, payload: SMTPSettingsUpdateRequest) -> SMTPSettingsOut:
    row = _ensure_global_smtp_settings(db)
    username = payload.username.strip()
    from_email = payload.from_email.strip() or (username if "@" in username else "")
    row.enabled = bool(payload.enabled)
    row.host = payload.host.strip()
    row.port = int(payload.port)
    row.username = username
    row.from_email = from_email
    row.use_tls = bool(payload.use_tls)
    row.use_ssl = bool(payload.use_ssl)
    row.timeout_seconds = float(payload.timeout_seconds)

    if payload.password is not None:
        value = payload.password.strip()
        row.password_encrypted = encrypt_text(value) if value else None
    elif payload.clear_password:
        row.password_encrypted = None

    db.add(row)
    db.commit()
    db.refresh(row)
    return get_smtp_settings(db)


def _resolve_runtime_from_db(db: Session) -> SMTPRuntimeConfig:
    row = db.query(GlobalSMTPSettings).filter(GlobalSMTPSettings.singleton_key == "global").first()
    if not row:
        raise ValueError("smtp settings not found")
    password = ""
    if row.password_encrypted:
        try:
            password = decrypt_text(row.password_encrypted)
        except Exception:
            password = ""
    return SMTPRuntimeConfig(
        enabled=bool(row.enabled),
        host=(row.host or "").strip(),
        port=int(row.port or 587),
        username=(row.username or "").strip(),
        password=password,
        from_email=(row.from_email or "").strip(),
        use_tls=bool(row.use_tls),
        use_ssl=bool(row.use_ssl),
        timeout_seconds=float(row.timeout_seconds or 10.0),
        source="database",
    )


def resolve_smtp_runtime_config() -> SMTPRuntimeConfig:
    db = SessionLocal()
    try:
        try:
            config = _resolve_runtime_from_db(db)
            if config.host or config.from_email or config.enabled:
                return config
        except Exception:
            pass
    finally:
        db.close()

    return SMTPRuntimeConfig(
        enabled=bool(settings.smtp_host.strip() and settings.smtp_from_email.strip()),
        host=settings.smtp_host.strip(),
        port=int(settings.smtp_port),
        username=settings.smtp_username.strip(),
        password=settings.smtp_password,
        from_email=settings.smtp_from_email.strip(),
        use_tls=bool(settings.smtp_use_tls),
        use_ssl=bool(settings.smtp_use_ssl),
        timeout_seconds=float(settings.smtp_timeout_seconds),
        source="env_fallback",
    )
