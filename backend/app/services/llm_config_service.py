from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.llm_provider_config import LLMProviderConfig
from app.utils.crypto import decrypt_text, encrypt_text


@dataclass(frozen=True)
class ProviderSpec:
    key: str
    label: str
    family: str
    default_base_url: str
    auth_mode: str
    token_label: str
    notes: str


PROVIDER_SPECS: dict[str, ProviderSpec] = {
    "chatgpt": ProviderSpec(
        key="chatgpt",
        label="ChatGPT (OpenAI)",
        family="openai",
        default_base_url="https://api.openai.com/v1",
        auth_mode="bearer",
        token_label="OpenAI API Key",
        notes="Official OpenAI endpoint.",
    ),
    "gemini": ProviderSpec(
        key="gemini",
        label="Gemini (Google)",
        family="gemini",
        default_base_url="https://generativelanguage.googleapis.com/v1beta",
        auth_mode="query_key",
        token_label="Google AI API Key",
        notes="Uses Gemini models.list endpoint.",
    ),
    "claude": ProviderSpec(
        key="claude",
        label="Claude (Anthropic)",
        family="anthropic",
        default_base_url="https://api.anthropic.com/v1",
        auth_mode="x_api_key",
        token_label="Anthropic API Key",
        notes="Uses /v1/models endpoint with anthropic-version header.",
    ),
    "manus": ProviderSpec(
        key="manus",
        label="Manus",
        family="manus",
        default_base_url="https://api.manus.im/v1",
        auth_mode="api_key_header",
        token_label="Manus API Key",
        notes="OpenAI-compatible workflow with API_KEY header.",
    ),
    "qwen": ProviderSpec(
        key="qwen",
        label="Qwen",
        family="openai",
        default_base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        auth_mode="bearer",
        token_label="Qwen/DashScope API Key",
        notes="Configured as OpenAI-compatible endpoint.",
    ),
    "local_lm_studio": ProviderSpec(
        key="local_lm_studio",
        label="LLM Local (LM Studio)",
        family="openai",
        default_base_url="http://localhost:1234/v1",
        auth_mode="optional_bearer",
        token_label="Optional API Key",
        notes="OpenAI-compatible local server.",
    ),
    "local_ollama": ProviderSpec(
        key="local_ollama",
        label="LLM Local (Ollama)",
        family="openai",
        default_base_url="http://localhost:11434/v1",
        auth_mode="optional_bearer",
        token_label="Optional API Key",
        notes="OpenAI-compatible Ollama endpoint.",
    ),
    "custom_openai": ProviderSpec(
        key="custom_openai",
        label="Custom OpenAI-Compatible",
        family="openai",
        default_base_url="http://localhost:8001/v1",
        auth_mode="optional_bearer",
        token_label="Optional API Key",
        notes="Use any OpenAI-compatible gateway.",
    ),
}


def list_provider_specs() -> list[dict[str, str]]:
    return [
        {
            "key": spec.key,
            "label": spec.label,
            "family": spec.family,
            "default_base_url": spec.default_base_url,
            "token_label": spec.token_label,
            "notes": spec.notes,
        }
        for spec in PROVIDER_SPECS.values()
    ]


def _normalize_openai_models_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/models"
    return f"{base}/v1/models"


def _fetch_openai_compatible_models(base_url: str, api_token: str | None, extra_headers: dict[str, str] | None = None) -> list[dict[str, str]]:
    headers: dict[str, str] = {"Accept": "application/json"}
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    if extra_headers:
        headers.update(extra_headers)

    url = _normalize_openai_models_url(base_url)
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    rows = data.get("data", []) if isinstance(data, dict) else []
    return [
        {"id": row.get("id", ""), "label": row.get("id", "")}
        for row in rows
        if row.get("id")
    ]


def _fetch_anthropic_models(base_url: str, api_token: str) -> list[dict[str, str]]:
    url = f"{base_url.rstrip('/')}/models"
    headers = {
        "x-api-key": api_token,
        "anthropic-version": "2023-06-01",
        "Accept": "application/json",
    }
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    rows = data.get("data", []) if isinstance(data, dict) else []
    return [
        {"id": row.get("id", ""), "label": row.get("display_name") or row.get("id", "")}
        for row in rows
        if row.get("id")
    ]


def _fetch_gemini_models(base_url: str, api_token: str) -> list[dict[str, str]]:
    url = f"{base_url.rstrip('/')}/models"
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, params={"key": api_token})
        resp.raise_for_status()
        data = resp.json()

    rows = data.get("models", []) if isinstance(data, dict) else []
    out: list[dict[str, str]] = []
    for row in rows:
        model_name = row.get("name", "")
        display = row.get("displayName") or model_name
        if model_name:
            out.append({"id": model_name, "label": display})
    return out


def fetch_models(provider_key: str, base_url: str, api_token: str | None) -> list[dict[str, str]]:
    spec = PROVIDER_SPECS.get(provider_key)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown provider")

    if spec.auth_mode in {"bearer", "query_key", "x_api_key", "api_key_header"} and not api_token:
        raise HTTPException(status_code=400, detail=f"{spec.token_label} is required")

    try:
        if spec.family == "gemini":
            return _fetch_gemini_models(base_url, api_token or "")
        if spec.family == "anthropic":
            return _fetch_anthropic_models(base_url, api_token or "")
        if spec.family == "manus":
            return _fetch_openai_compatible_models(
                base_url,
                api_token,
                extra_headers={"API_KEY": api_token or ""},
            )
        return _fetch_openai_compatible_models(base_url, api_token)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=400, detail=f"Provider request failed: {exc.response.status_code}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Provider request failed: {exc}") from exc


def _mask_token(token: str | None) -> str | None:
    if not token:
        return None
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}***{token[-4:]}"


def list_configs(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(LLMProviderConfig)
        .order_by(LLMProviderConfig.provider_label.asc())
        .all()
    )

    out: list[dict[str, Any]] = []
    for row in rows:
        token_preview = None
        if row.api_token_encrypted:
            try:
                token_preview = _mask_token(decrypt_text(row.api_token_encrypted))
            except Exception:
                token_preview = "***"

        out.append(
            {
                "id": row.id,
                "provider_key": row.provider_key,
                "provider_label": row.provider_label,
                "base_url": row.base_url,
                "selected_model": row.selected_model,
                "is_enabled": row.is_enabled,
                "token_configured": bool(row.api_token_encrypted),
                "token_preview": token_preview,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )
    return out


def upsert_config(
    db: Session,
    *,
    tenant_id: str | None,
    provider_key: str,
    provider_label: str,
    base_url: str,
    selected_model: str | None,
    is_enabled: bool,
    api_token: str | None,
) -> dict[str, Any]:
    row = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.provider_key == provider_key)
        .first()
    )

    if not row:
        row = LLMProviderConfig(
            tenant_id=tenant_id,
            provider_key=provider_key,
            provider_label=provider_label,
            base_url=base_url,
            selected_model=selected_model,
            is_enabled=is_enabled,
        )

    row.provider_label = provider_label
    row.base_url = base_url
    row.selected_model = selected_model
    row.is_enabled = is_enabled
    if api_token is not None:
        row.api_token_encrypted = encrypt_text(api_token) if api_token.strip() else None

    db.add(row)
    db.commit()
    db.refresh(row)

    token_preview = None
    if row.api_token_encrypted:
        try:
            token_preview = _mask_token(decrypt_text(row.api_token_encrypted))
        except Exception:
            token_preview = "***"

    return {
        "id": row.id,
        "provider_key": row.provider_key,
        "provider_label": row.provider_label,
        "base_url": row.base_url,
        "selected_model": row.selected_model,
        "is_enabled": row.is_enabled,
        "token_configured": bool(row.api_token_encrypted),
        "token_preview": token_preview,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def resolve_config_token(db: Session, provider_key: str) -> str | None:
    row = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.provider_key == provider_key)
        .first()
    )
    if not row or not row.api_token_encrypted:
        return None
    try:
        return decrypt_text(row.api_token_encrypted)
    except Exception:
        return None


def resolve_config_base_url(db: Session, provider_key: str) -> str | None:
    row = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.provider_key == provider_key)
        .first()
    )
    return row.base_url if row else None
