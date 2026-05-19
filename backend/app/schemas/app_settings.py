from pydantic import BaseModel, Field
from typing import Literal


class SecuritySettingsOut(BaseModel):
    quarantine_threshold: float = Field(ge=0, le=100)
    block_threshold: float = Field(ge=0, le=100)
    auto_block_enabled: bool


class RetentionSettingsOut(BaseModel):
    reports_days: int = Field(ge=1, le=3650)
    files_days: int = Field(ge=1, le=3650)


class NotificationSettingsOut(BaseModel):
    emails: list[str] = Field(default_factory=list)
    notify_on_warning: bool
    notify_on_critical: bool
    notify_on_dead_letter: bool


class UISettingsOut(BaseModel):
    language: Literal["pt-BR", "en-US", "es-ES"]


class TenantLanguageOut(BaseModel):
    language: Literal["pt-BR", "en-US", "es-ES"]


class SMTPSettingsOut(BaseModel):
    enabled: bool
    host: str
    port: int = Field(ge=1, le=65535)
    username: str
    from_email: str
    use_tls: bool
    use_ssl: bool
    timeout_seconds: float = Field(ge=1, le=120)
    password_configured: bool
    source: Literal["database", "env_fallback"] = "database"


class CrawlSettingsOut(BaseModel):
    internal_links_enabled: bool
    max_pages: int = Field(ge=1, le=500)
    max_depth: int = Field(ge=0, le=10)
    timeout_seconds: float = Field(ge=5, le=600)
    source: Literal["database", "env_fallback"] = "database"


class TenantAppSettingsOut(BaseModel):
    security: SecuritySettingsOut
    retention: RetentionSettingsOut
    notifications: NotificationSettingsOut
    ui: UISettingsOut
    smtp: SMTPSettingsOut | None = None
    crawl: CrawlSettingsOut | None = None


class SecuritySettingsUpdateRequest(BaseModel):
    quarantine_threshold: float = Field(ge=0, le=100)
    block_threshold: float = Field(ge=0, le=100)
    auto_block_enabled: bool


class RetentionSettingsUpdateRequest(BaseModel):
    reports_days: int = Field(ge=1, le=3650)
    files_days: int = Field(ge=1, le=3650)


class NotificationSettingsUpdateRequest(BaseModel):
    emails: list[str] = Field(default_factory=list, max_length=50)
    notify_on_warning: bool
    notify_on_critical: bool
    notify_on_dead_letter: bool


class UISettingsUpdateRequest(BaseModel):
    language: Literal["pt-BR", "en-US", "es-ES"]


class SMTPSettingsUpdateRequest(BaseModel):
    enabled: bool = True
    host: str = Field(default="", max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    username: str = Field(default="", max_length=255)
    from_email: str = Field(default="", max_length=255)
    use_tls: bool = True
    use_ssl: bool = False
    timeout_seconds: float = Field(default=10.0, ge=1, le=120)
    password: str | None = None
    clear_password: bool = False


class CrawlSettingsUpdateRequest(BaseModel):
    internal_links_enabled: bool = True
    max_pages: int = Field(default=40, ge=1, le=500)
    max_depth: int = Field(default=3, ge=0, le=10)
    timeout_seconds: float = Field(default=90.0, ge=5, le=600)


class TenantAppSettingsUpdateRequest(BaseModel):
    security: SecuritySettingsUpdateRequest
    retention: RetentionSettingsUpdateRequest
    notifications: NotificationSettingsUpdateRequest
    ui: UISettingsUpdateRequest | None = None
    smtp: SMTPSettingsUpdateRequest | None = None
    crawl: CrawlSettingsUpdateRequest | None = None


class TenantLanguageUpdateRequest(BaseModel):
    language: Literal["pt-BR", "en-US", "es-ES"]


class SmtpTestRequest(BaseModel):
    recipient_email: str | None = None


class SmtpTestResponse(BaseModel):
    sent: bool
    message: str
