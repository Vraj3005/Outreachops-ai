import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    # Supabase configuration
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Gemini configuration
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_LIST: str = "gemini-2.5-flash-lite,gemini-2.5-flash"
    DEMO_MODE: bool = True


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
    
    # App Port
    PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def gemini_models(self) -> List[str]:
        return [m.strip() for m in self.GEMINI_MODEL_LIST.split(",") if m.strip()]

settings = Settings()
