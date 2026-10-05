from pydantic_settings import BaseSettings
from pydantic import field_validator
import os

class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    SECRET_KEY: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"
    AGENT_SUPERVISOR_MODEL: str = "gpt-4o-mini"
    AGENT_WORKER_MODEL: str = "gpt-4o-mini"
    AGENT_MAX_STEPS: int = 10
    AGENT_SUPERVISOR_MODE: str = "single_plan"
    AGENT_DECISION_REASONS: bool = True
    AGENT_ASYNC_GRAPH: bool = True
    AGENT_EMAIL_REVIEW_MODE: str = "policy"
    AGENT_WORKER_TIMEOUT_SECONDS: float = 20.0
    AGENT_AUTONOMY_MODE: str = "disabled"
    AGENT_INVITE_MIN_FIT_SCORE: int = 75
    AGENT_REJECT_MAX_SCREENING_SCORE: int = 45
    OPENAI_STRUCTURED_OUTPUTS: bool = True
    RESUME_UPLOAD_USE_LLM: bool = False
    LLM_TIMEOUT: float = 35.0
    RESUME_AGENT_TEMP: float = 0.1
    REQUIREMENT_AGENT_TEMP: float = 0.2
    MATCHING_AGENT_TEMP: float = 0.4
    INTERVIEW_AGENT_TEMP: float = 0.3
    REPORT_AGENT_TEMP: float = 0.3
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "recruiter-bot@company.com"
    SMTP_PASSWORD: str = "your-app-specific-password"
    LINKEDIN_LI_AT_COOKIE: str = ""
    LINKEDIN_HEADLESS: bool = True
    APIFY_API_TOKEN: str = ""
    APIFY_PROFILE_ACTOR_ID: str = "LpVuK3Zozwuipa5bp"
    APIFY_SEARCH_ACTOR_ID: str = "curious_coder/linkedin-people-search-scraper"
    APIFY_TIMEOUT_SECONDS: int = 90
    RANKING_API_URL: str = ""
    RANKING_API_KEY: str = ""
    APP_TIMEZONE: str = "Asia/Kuala_Lumpur"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_flag(cls, value):
        if isinstance(value, bool) or value is None:
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
                return False
        return value

    class Config:
        # Load backend-specific settings from backend/.env.
        env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()

