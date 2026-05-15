from pydantic import BaseModel, Field


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


class TenantAppSettingsOut(BaseModel):
    security: SecuritySettingsOut
    retention: RetentionSettingsOut
    notifications: NotificationSettingsOut


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


class TenantAppSettingsUpdateRequest(BaseModel):
    security: SecuritySettingsUpdateRequest
    retention: RetentionSettingsUpdateRequest
    notifications: NotificationSettingsUpdateRequest

