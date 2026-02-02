from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "dev"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "clipforge"
    redis_url: str = "redis://localhost:6379/0"
    session_secret: str = "change_me"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
