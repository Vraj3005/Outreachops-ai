import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Environment Selector: production, development, test, demo
    ENV: str = "development"

    # Supabase configuration
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Gemini configuration
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_LIST: str = "gemini-2.5-flash-lite,gemini-2.5-flash"
    DEMO_MODE: bool = True

    # Owner details
    OWNER_EMAIL: str = "yash69699696@gmail.com"
    OWNER_USER_ID: str = "d3b07384-d113-4ec2-a72d-86284f1837b2"
    DEMO_SENDING_ENABLED: bool = False

    # Google APIs configuration
    GOOGLE_SHEET_NAME: str = "pitbull-cold-emails-calls"
    MAIN_TAB_NAME: str = "Demo"
    DRAFT_TAB_NAME: str = "Email Demo Drafts"
    SHEETS_CREDENTIALS_PATH: str = "sheets_credentials.json"

    GMAIL_CREDENTIALS_PATH: str = "gmail_credentials.json"
    GMAIL_TOKEN_PATH: str = "gmail_token.pkl"

    # Branding/Signature settings
    YOUR_AGENCY_NAME: str = "Pitbull Corporations"
    YOUR_WEBSITE: str = "https://pitbullcorporations.com"
    YOUR_NAME: str = "Vraj"
    YOUR_PHONE: str = ""

    # Queue controls
    BATCH_SIZE: int = 5
    GEMINI_DELAY: int = 6
    SEND_DELAY: int = 5

    # App Port and URLs
    PORT: int = 8000
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"

    # Server-side encryption key
    ENCRYPTION_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def gemini_models(self) -> list[str]:
        return [m.strip() for m in self.GEMINI_MODEL_LIST.split(",") if m.strip()]

    @model_validator(mode="after")
    def validate_production_keys(self) -> "Settings":
        if self.ENV.lower() == "production" and not self.DEMO_MODE:
            required_fields = [
                ("SUPABASE_URL", self.SUPABASE_URL),
                ("SUPABASE_ANON_KEY", self.SUPABASE_ANON_KEY),
                ("SUPABASE_SERVICE_ROLE_KEY", self.SUPABASE_SERVICE_ROLE_KEY),
                ("GEMINI_API_KEY", self.GEMINI_API_KEY),
                ("OWNER_EMAIL", self.OWNER_EMAIL),
                ("ENCRYPTION_KEY", self.ENCRYPTION_KEY),
            ]
            missing = [
                name for name, val in required_fields if not val or not val.strip()
            ]
            if missing:
                raise ValueError(
                    f"Missing required production environment variables: {', '.join(missing)}. "
                    f"Please check your .env file or production configuration."
                )
        return self


settings = Settings()
