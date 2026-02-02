from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserInDB(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    email: EmailStr
    name: str
    picture_url: str | None = None
    created_at: datetime
    updated_at: datetime
