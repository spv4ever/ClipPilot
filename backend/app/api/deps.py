from fastapi import Depends, HTTPException, Request, status
import jwt

from app.core.security import decode_session_token
from app.db.mongo import get_db
from app.models.user import UserInDB


async def get_current_user(request: Request, db=Depends(get_db)) -> UserInDB:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_session_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id and not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    user_doc = None
    if user_id:
        user_doc = await db["users"].find_one({"id": user_id})
    if not user_doc and email:
        user_doc = await db["users"].find_one({"email": email})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return UserInDB(**user_doc)
