from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import close_pool, get_pool
from app.routers.context import router as context_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(title="geotagging-weather", lifespan=lifespan)
app.include_router(context_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
