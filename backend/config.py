
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # LLM Settings
    google_api_key: str = "placeholder-key"
    llm_model: str = "gemini-2.0-flash"
    llm_fallback_model: str = "gemini-2.0-flash-lite"
    llm_temperature: float = 0.3
    llm_max_retries: int = 2

    # App Settings
    app_env: str = "development"
    app_debug: bool = True
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_pro_monthly: str = ""   # Stripe Price ID for $12/mo
    stripe_price_pro_annual: str = ""    # Stripe Price ID for $89/yr

    # OAuth & Encryption
    encryption_key: str = ""
    google_client_id: str | None = None
    google_client_secret: str | None = None
    microsoft_client_id: str | None = None
    microsoft_client_secret: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None
    frontend_url: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
