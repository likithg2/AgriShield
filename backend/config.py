"""
config.py — Application Settings
Uses environment variables with sensible defaults for local development.

IMPORTANT: Never commit real secrets. Set all secrets via environment variables
in production (Render dashboard). See .env.example for the full list.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = ROOT_DIR / "postharvest.db"


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    # Default: SQLite (zero setup, works immediately for local dev)
    # Production: Set DATABASE_URL=postgresql://user:pass@host:5432/dbname
    DATABASE_URL: str = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"

    # ── JWT Authentication ────────────────────────────────────────────────────
    # MUST be overridden in production via SECRET_KEY env var
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ── External API Keys ─────────────────────────────────────────────────────
    # Set these via environment variables — never hardcode real keys here
    WEATHER_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    MARKET_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
