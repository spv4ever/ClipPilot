from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_session_token
from app.db.mongo import get_db
from app.models.user import UserInDB


class GoogleLoginRequest(BaseModel):
    id_token: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    picture_url: str | None = None


class LogoutResponse(BaseModel):
    ok: bool


auth_router = APIRouter(prefix="/v1/auth", tags=["auth"])
me_router = APIRouter(prefix="/v1", tags=["auth"])


@auth_router.post("/google/login", response_model=UserResponse)
async def google_login(
    payload: GoogleLoginRequest,
    response: Response,
    db=Depends(get_db),
) -> UserResponse:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID not configured",
        )
    try:
        token_info = google_id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        ) from exc

    email = token_info.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not available from Google token",
        )

    name = token_info.get("name") or ""
    picture_url = token_info.get("picture")
    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())

    await db["users"].update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "name": name,
                "picture_url": picture_url,
                "updated_at": now,
            },
            "$setOnInsert": {"id": user_id, "created_at": now},
        },
        upsert=True,
    )

    user_doc = await db["users"].find_one({"email": email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User upsert failed",
        )

    session_token = create_session_token(user_doc["id"], user_doc["email"])
    response.set_cookie(
        "session",
        session_token,
        httponly=True,
        secure=settings.env == "prod",
        samesite="lax",
        max_age=settings.session_expire_days * 24 * 60 * 60,
    )

    return UserResponse(
        id=user_doc["id"],
        email=user_doc["email"],
        name=user_doc.get("name", ""),
        picture_url=user_doc.get("picture_url"),
    )


@auth_router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response) -> LogoutResponse:
    response.delete_cookie(
        "session",
        httponly=True,
        secure=settings.env == "prod",
        samesite="lax",
    )
    return LogoutResponse(ok=True)


@me_router.get("/me", response_model=UserResponse)
async def me(current_user: UserInDB = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        picture_url=current_user.picture_url,
    )
