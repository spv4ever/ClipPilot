from fastapi import APIRouter

from app.db.mongo import get_db

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    db = get_db()
    await db.command("ping")
    return {"status": "ok", "mongo": "ok"}
