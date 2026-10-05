from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class FoundationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    APP_MODE: str = "demo_free"
    PRIVACY_CONTACT: str = ""
    TRACKER_ENABLED: bool = True
    ANALYTICS_ENABLED: bool = True
    REMINDER_WORKER_ENABLED: bool = False
    REMINDER_SENDER: str = "disabled"
    REMINDER_EMAIL_APPROVED: bool = False
    REMINDER_FREE_SMTP_APPROVED: bool = False
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    @field_validator("REMINDER_SENDER")
    @classmethod
    def reminder_sender_mode(cls,value):
        if value not in ("disabled","fixture","smtp"):raise ValueError("Use disabled, fixture or smtp")
        return value


    @field_validator("APP_MODE")
    @classmethod
    def synthetic_release_only(cls, value):
        if value != "demo_free":
            raise ValueError("Only demo_free is approved; pilot release requires reviewed live gates")
        return value
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SESSION_ENCRYPTION_KEY: str = ""
    DOCUMENT_ENCRYPTION_KEY: str = ""
    COOKIE_SECURE: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    PUBLIC_APP_URL: str = "http://localhost:5173"
    SESSION_TTL_SECONDS: int = 28800
    EMAIL_AUTH_ENABLED: bool = False
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    DOCUMENT_BUCKET: str = "kerja-private"
    DATABASE_URL: str = ""
    IDENTITY_REAL_ENABLED: bool = False
    JOB_DISCOVERY_ENABLED: bool = False
    SCRAPLING_ENABLED: bool = False
    EXTERNAL_LLM_ENABLED: bool = False
    OPENROUTER_API_KEY: str = ''
    M6_OPENROUTER_PROVIDER: str = ''
    M6_EXTERNAL_PRIVACY_APPROVED: bool = False

    @field_validator("SUPABASE_URL")
    @classmethod
    def validate_url(cls, value):
        if value and not (value.startswith("https://") or value.startswith("http://127.0.0.1:")):
            raise ValueError("Use HTTPS for hosted Supabase")
        return value.rstrip("/")

    @property
    def origins(self):
        return [value.strip().rstrip("/") for value in self.ALLOWED_ORIGINS.split(",") if value.strip()]

    @property
    def cookie_name(self):
        return "__Host-kerja" if self.COOKIE_SECURE else "kerja-local"

    @property
    def configured(self):
        return all((self.SUPABASE_URL, self.SUPABASE_PUBLISHABLE_KEY,
                    self.SUPABASE_SERVICE_ROLE_KEY, self.SESSION_ENCRYPTION_KEY))


@lru_cache
def get_settings():
    return FoundationSettings()
