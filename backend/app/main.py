from fastapi import FastAPI

from app.api.routers import health
from app.core.logging import setup_logging
from app.db.mongo import connect_mongo, disconnect_mongo


app = FastAPI(title="ClipForge API")


@app.on_event("startup")
async def startup() -> None:
    setup_logging()
    await connect_mongo()


@app.on_event("shutdown")
async def shutdown() -> None:
    await disconnect_mongo()


app.include_router(health.router)
