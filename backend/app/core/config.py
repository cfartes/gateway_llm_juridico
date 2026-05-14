from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nexus LLM Shield"
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

    cors_origins: str = "http://localhost:3000"
    allowed_hosts: str = "localhost,127.0.0.1"
    force_https: bool = False
    hsts_seconds: int = 31536000

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

