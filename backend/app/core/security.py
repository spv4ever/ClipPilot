from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


def create_session_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=settings.session_expire_days)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, settings.session_secret, algorithm="HS256")


def decode_session_token(token: str) -> dict:
    return jwt.decode(token, settings.session_secret, algorithms=["HS256"])
