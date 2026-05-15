from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nexus Gateway LLM Shield"
    environment: str = "dev"
    debug: bool = False
    version: str = "1.0.0"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/nexus_llm_shield"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 14
    password_reset_token_expire_minutes: int = 30
    password_min_length: int = 12
    encryption_key: str = "6L4v8hktqf5YfQ1X0vC1r2lQ7Q2mL8xA1F1yQf4L2i0="
    previous_secret_keys: str = ""

    openai_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    max_upload_size_mb: int = 50
    rate_limit_per_minute: int = 120
    api_token_gateway_rate_limit_per_minute: int = 180
    user_gateway_rate_limit_per_minute: int = 90

    cors_origins: str = "http://localhost:3000"
    allowed_hosts: str = "localhost,127.0.0.1"
    force_https: bool = False
    hsts_seconds: int = 31536000
    webhook_callback_timeout_seconds: float = 15.0
    webhook_callback_max_retries: int = 3
    webhook_callback_backoff_seconds: float = 1.0
    webhook_callback_allowed_domains: str = ""
    webhook_callback_allow_http_localhost: bool = True
    webhook_callback_block_private_networks: bool = True
    webhook_dead_letter_auto_retry_enabled: bool = True
    webhook_dead_letter_auto_retry_interval_seconds: int = 120
    webhook_dead_letter_auto_retry_batch_size: int = 25
    webhook_dead_letter_auto_retry_max_total_attempts: int = 12
    webhook_dead_letter_auto_retry_min_age_seconds: int = 60
    webhook_dead_letter_auto_retry_max_delay_seconds: int = 1800
    ops_alert_webhook_url: str | None = None
    ops_alert_timeout_seconds: float = 8.0
    ops_alert_cooldown_seconds: int = 900
    policy_llm_skip_high_hits_threshold: int = 2
    policy_quarantine_score_threshold: float = 55.0
    policy_block_score_threshold: float = 80.0
    refresh_cookie_name: str = "nexus_refresh_token"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: str = "lax"
    refresh_cookie_domain: str = ""
    refresh_cookie_path: str = "/api/v1/auth"
    superadmin_auto_bootstrap: bool = True
    superadmin_email: str = "superadmin@nexusshield.ai"
    superadmin_password: str = "StrongPass#2026"
    superadmin_full_name: str = "Nexus SuperAdmin"
    superadmin_tenant_name: str = "Nexus Platform"
    superadmin_tenant_slug: str = "nexus-platform"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

