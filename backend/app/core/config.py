from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "dev"
    mongodb_uri: str
    mongodb_db: str = "clipforge"
    redis_url: str = "redis://localhost:6379/0"
    session_secret: str

    model_config = SettingsConfigDict(
        env_file="backend/.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
