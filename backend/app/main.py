from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import health
from app.api.routers.auth import auth_router, me_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.mongo import connect_mongo, disconnect_mongo


app = FastAPI(title="ClipForge API")

if settings.frontend_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
async def startup() -> None:
    setup_logging()
    await connect_mongo()


@app.on_event("shutdown")
async def shutdown() -> None:
    await disconnect_mongo()


app.include_router(health.router)
app.include_router(auth_router)
app.include_router(me_router)
