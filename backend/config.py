"""
config.py — Application Settings
Uses environment variables with sensible defaults for local development.
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
    # Default: SQLite (zero setup, works immediately)
    # For production: set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postharvest_db
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH.as_posix()}")

    # ── JWT Authentication ────────────────────────────────────────────────────
    SECRET_KEY: str = os.getenv("SECRET_KEY", "bit-major-project-2023-27-super-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ── API Keys (forwarded from the Streamlit layer) ─────────────────────────
    WEATHER_API_KEY: str = os.getenv("WEATHER_API_KEY", "f73ec997eba0f6cd98247c6116943aa5")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    MARKET_API_KEY: str = os.getenv("MARKET_API_KEY", "")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
