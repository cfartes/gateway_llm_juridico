from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass
class CNPJProviderSignals:
    registration_status: str | None = None
    debt_level: str | None = None
    lawsuit_level: str | None = None
    sintegra_enabled: bool | None = None
    source: str = "mock"


@dataclass
class NFEProviderResult:
    sefaz_status: str | None = None
    source: str = "mock"


def _normalize_registration_status(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    aliases = {
        "active": "active",
        "ativa": "active",
        "habilitada": "active",
        "suspended": "suspended",
        "suspensa": "suspended",
        "inactive": "inactive",
        "inativa": "inactive",
        "baixada": "inactive",
        "nula": "inactive",
    }
    return aliases.get(normalized, None)


def _normalize_level(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    aliases = {
        "none": "none",
        "sem": "none",
        "nao": "none",
        "moderate": "moderate",
        "media": "moderate",
        "average": "moderate",
        "high": "high",
        "alta": "high",
    }
    return aliases.get(normalized, None)


def _normalize_lawsuit(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    aliases = {
        "below_average": "below_average",
        "baixo": "below_average",
        "average": "average",
        "medio": "average",
        "high": "above_average",
        "above_average": "above_average",
        "alto": "above_average",
    }
    return aliases.get(normalized, None)


def fetch_cnpj_signals(cnpj: str) -> CNPJProviderSignals:
    mode = (settings.br_cnpj_provider_mode or "mock").strip().lower()
    if mode == "mock":
        return CNPJProviderSignals(source="mock")
    if mode != "custom":
        return CNPJProviderSignals(source=f"unsupported:{mode}")
    if not settings.br_cnpj_provider_base_url:
        return CNPJProviderSignals(source="custom:missing_base_url")

    url = settings.br_cnpj_provider_base_url.rstrip("/")
    headers: dict[str, str] = {"Accept": "application/json"}
    if settings.br_cnpj_provider_token:
        headers["Authorization"] = f"Bearer {settings.br_cnpj_provider_token}"

    try:
        with httpx.Client(timeout=settings.br_cnpj_provider_timeout_seconds) as client:
            response = client.get(url, params={"cnpj": cnpj}, headers=headers)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return CNPJProviderSignals(source="custom:error")

    if not isinstance(payload, dict):
        return CNPJProviderSignals(source="custom:invalid_payload")

    return CNPJProviderSignals(
        registration_status=_normalize_registration_status(payload.get("registration_status")),
        debt_level=_normalize_level(payload.get("debt_level")),
        lawsuit_level=_normalize_lawsuit(payload.get("lawsuit_level")),
        sintegra_enabled=payload.get("sintegra_enabled") if isinstance(payload.get("sintegra_enabled"), bool) else None,
        source="custom",
    )


def _normalize_sefaz_status(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    aliases = {
        "autorizada": "Autorizada",
        "authorized": "Autorizada",
        "cancelada": "Cancelada",
        "cancelled": "Cancelada",
        "denegada": "Denegada",
        "denied": "Denegada",
        "inexistente": "Inexistente",
        "not_found": "Inexistente",
    }
    return aliases.get(normalized, None)


def fetch_nfe_status(access_key: str) -> NFEProviderResult:
    mode = (settings.br_nfe_provider_mode or "mock").strip().lower()
    if mode == "mock":
        return NFEProviderResult(source="mock")
    if mode != "custom":
        return NFEProviderResult(source=f"unsupported:{mode}")
    if not settings.br_nfe_provider_base_url:
        return NFEProviderResult(source="custom:missing_base_url")

    url = settings.br_nfe_provider_base_url.rstrip("/")
    headers: dict[str, str] = {"Accept": "application/json"}
    if settings.br_nfe_provider_token:
        headers["Authorization"] = f"Bearer {settings.br_nfe_provider_token}"

    try:
        with httpx.Client(timeout=settings.br_nfe_provider_timeout_seconds) as client:
            response = client.get(url, params={"access_key": access_key}, headers=headers)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return NFEProviderResult(source="custom:error")

    if not isinstance(payload, dict):
        return NFEProviderResult(source="custom:invalid_payload")

    return NFEProviderResult(
        sefaz_status=_normalize_sefaz_status(payload.get("sefaz_status")),
        source="custom",
    )
