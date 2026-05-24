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
    if mode == "receitaws":
        return _fetch_cnpj_receitaws(cnpj)
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


def _fetch_cnpj_receitaws(cnpj: str) -> CNPJProviderSignals:
    base_url = (settings.br_cnpj_provider_base_url or "").strip() or "https://www.receitaws.com.br/v1/cnpj"
    url = f"{base_url.rstrip('/')}/{cnpj}"
    headers: dict[str, str] = {"Accept": "application/json"}
    params: dict[str, str] = {}
    if settings.br_cnpj_provider_token:
        params["token"] = settings.br_cnpj_provider_token
        headers["x_api_token"] = settings.br_cnpj_provider_token

    try:
        with httpx.Client(timeout=settings.br_cnpj_provider_timeout_seconds) as client:
            response = client.get(url, headers=headers, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return CNPJProviderSignals(source="receitaws:error")

    if not isinstance(payload, dict):
        return CNPJProviderSignals(source="receitaws:invalid_payload")

    status_text = str(payload.get("status", "")).strip().upper()
    if status_text in {"ERROR", "ERRO"}:
        return CNPJProviderSignals(source="receitaws:not_available")

    situacao = payload.get("situacao")
    registration_status = _normalize_registration_status(situacao)
    sintegra_enabled = True if registration_status == "active" else (False if registration_status else None)
    return CNPJProviderSignals(
        registration_status=registration_status,
        debt_level=None,
        lawsuit_level=None,
        sintegra_enabled=sintegra_enabled,
        source="receitaws",
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
    if mode == "focusnfe":
        return _fetch_nfe_focusnfe(access_key)
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


def _fetch_nfe_focusnfe(access_key: str) -> NFEProviderResult:
    if not settings.br_nfe_provider_token:
        return NFEProviderResult(source="focusnfe:missing_token")

    url = f"https://api.focusnfe.com.br/v2/nfes_recebidas/{access_key}.json"
    headers = {"Accept": "application/json"}
    auth = httpx.BasicAuth(settings.br_nfe_provider_token, "")

    try:
        with httpx.Client(timeout=settings.br_nfe_provider_timeout_seconds, auth=auth) as client:
            response = client.get(url, headers=headers, params={"completa": "0"})
            if response.status_code == 404:
                return NFEProviderResult(sefaz_status="Inexistente", source="focusnfe")
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return NFEProviderResult(source="focusnfe:error")

    if not isinstance(payload, dict):
        return NFEProviderResult(source="focusnfe:invalid_payload")

    candidates: list[str | None] = [
        payload.get("sefaz_status"),
        payload.get("status"),
        payload.get("situacao"),
        payload.get("descricao_status"),
        payload.get("descricao_situacao"),
    ]
    normalized = None
    for candidate in candidates:
        normalized = _normalize_sefaz_status(str(candidate) if candidate is not None else None)
        if normalized:
            break
        lowered = str(candidate or "").lower()
        if "cancel" in lowered:
            normalized = "Cancelada"
            break
        if "deneg" in lowered:
            normalized = "Denegada"
            break
        if "autor" in lowered or "aprov" in lowered:
            normalized = "Autorizada"
            break

    return NFEProviderResult(
        sefaz_status=normalized,
        source="focusnfe",
    )
