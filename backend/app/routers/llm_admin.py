from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.llm_config import (
    FetchModelsRequest,
    FetchModelsResponse,
    LLMConfigOut,
    LLMConfigUpsertRequest,
    LLMProviderInfo,
)
from app.services.audit_service import write_audit_log
from app.services.llm_config_service import (
    PROVIDER_SPECS,
    fetch_models,
    list_configs,
    list_provider_specs,
    resolve_config_base_url,
    resolve_config_token,
    upsert_config,
)


router = APIRouter(prefix="/admin/llm-config", tags=["llm-config"])


@router.get("/providers", response_model=list[LLMProviderInfo])
def get_providers(auth=Depends(require_roles(UserRole.ADMIN))):
    return list_provider_specs()


@router.get("/configs", response_model=list[LLMConfigOut])
def get_configs(auth=Depends(require_roles(UserRole.ADMIN)), db: Session = Depends(get_db)):
    return list_configs(db, auth.tenant_id)


@router.put("/configs/{provider_key}", response_model=LLMConfigOut)
def save_config(
    provider_key: str,
    payload: LLMConfigUpsertRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    spec = PROVIDER_SPECS.get(provider_key)
    if not spec:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Unknown provider")

    config = upsert_config(
        db,
        tenant_id=auth.tenant_id,
        provider_key=provider_key,
        provider_label=payload.provider_label,
        base_url=payload.base_url,
        selected_model=payload.selected_model,
        is_enabled=payload.is_enabled,
        api_token=payload.api_token,
    )

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="llm_config.upsert",
        resource_type="llm_provider_config",
        resource_id=config["id"],
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"provider_key": provider_key, "enabled": payload.is_enabled},
    )

    return config


@router.post("/configs/{provider_key}/fetch-models", response_model=FetchModelsResponse)
def fetch_provider_models(
    provider_key: str,
    payload: FetchModelsRequest,
    auth=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    spec = PROVIDER_SPECS.get(provider_key)
    if not spec:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Unknown provider")

    resolved_base_url = payload.base_url or resolve_config_base_url(db, auth.tenant_id, provider_key) or spec.default_base_url
    resolved_token = payload.api_token
    if resolved_token is None:
        resolved_token = resolve_config_token(db, auth.tenant_id, provider_key)

    models = fetch_models(provider_key, resolved_base_url, resolved_token)
    return FetchModelsResponse(provider_key=provider_key, models=models)
