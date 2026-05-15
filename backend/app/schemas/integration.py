from pydantic import BaseModel, Field, HttpUrl


class WebhookIntegrationOut(BaseModel):
    enabled: bool = False
    url: HttpUrl | None = None
    secret_configured: bool = False
    auth_bearer_configured: bool = False


class SIEMIntegrationOut(BaseModel):
    enabled: bool = False
    provider: str | None = None
    endpoint: HttpUrl | None = None
    auth_token_configured: bool = False


class SlackIntegrationOut(BaseModel):
    enabled: bool = False
    webhook_url: HttpUrl | None = None
    channel: str | None = None
    bot_token_configured: bool = False


class OpsAlertsIntegrationOut(BaseModel):
    enabled: bool = False
    webhook_enabled: bool = False
    webhook_url: HttpUrl | None = None
    webhook_auth_bearer_configured: bool = False
    slack_enabled: bool = False
    teams_enabled: bool = False
    teams_webhook_url: HttpUrl | None = None
    email_enabled: bool = False
    email_recipients: list[str] = Field(default_factory=list)


class IntegrationConfigOut(BaseModel):
    webhook: WebhookIntegrationOut
    siem: SIEMIntegrationOut
    slack: SlackIntegrationOut
    ops_alerts: OpsAlertsIntegrationOut


class WebhookIntegrationUpdateRequest(BaseModel):
    enabled: bool
    url: HttpUrl | None = None
    secret: str | None = Field(default=None, min_length=8, max_length=256)
    clear_secret: bool = False
    auth_bearer: str | None = Field(default=None, min_length=8, max_length=2048)
    clear_auth_bearer: bool = False


class SIEMIntegrationUpdateRequest(BaseModel):
    enabled: bool
    provider: str | None = Field(default=None, max_length=64)
    endpoint: HttpUrl | None = None
    auth_token: str | None = Field(default=None, min_length=8, max_length=2048)
    clear_auth_token: bool = False


class SlackIntegrationUpdateRequest(BaseModel):
    enabled: bool
    webhook_url: HttpUrl | None = None
    channel: str | None = Field(default=None, max_length=255)
    bot_token: str | None = Field(default=None, min_length=8, max_length=2048)
    clear_bot_token: bool = False


class OpsAlertsIntegrationUpdateRequest(BaseModel):
    enabled: bool
    webhook_enabled: bool = False
    webhook_url: HttpUrl | None = None
    webhook_auth_bearer: str | None = Field(default=None, min_length=8, max_length=2048)
    clear_webhook_auth_bearer: bool = False
    slack_enabled: bool = False
    teams_enabled: bool = False
    teams_webhook_url: HttpUrl | None = None
    email_enabled: bool = False
    email_recipients: list[str] = Field(default_factory=list, max_length=50)


class IntegrationConfigUpdateRequest(BaseModel):
    webhook: WebhookIntegrationUpdateRequest
    siem: SIEMIntegrationUpdateRequest
    slack: SlackIntegrationUpdateRequest
    ops_alerts: OpsAlertsIntegrationUpdateRequest = Field(
        default_factory=lambda: OpsAlertsIntegrationUpdateRequest(enabled=False)
    )
