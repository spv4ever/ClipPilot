from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserInDB(BaseModel):
    id: str
    email: EmailStr
    name: str
    picture_url: str | None = None
    created_at: datetime
    updated_at: datetime
