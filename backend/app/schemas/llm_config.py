from datetime import datetime

from pydantic import BaseModel


class LLMProviderInfo(BaseModel):
    key: str
    label: str
    family: str
    default_base_url: str
    token_label: str
    notes: str


class LLMConfigUpsertRequest(BaseModel):
    provider_label: str
    base_url: str
    selected_model: str | None = None
    is_enabled: bool = False
    api_token: str | None = None


class LLMConfigOut(BaseModel):
    id: str
    provider_key: str
    provider_label: str
    base_url: str
    selected_model: str | None
    is_enabled: bool
    token_configured: bool
    token_preview: str | None
    created_at: datetime
    updated_at: datetime


class FetchModelsRequest(BaseModel):
    base_url: str | None = None
    api_token: str | None = None


class ProviderModelOut(BaseModel):
    id: str
    label: str


class FetchModelsResponse(BaseModel):
    provider_key: str
    models: list[ProviderModelOut]
