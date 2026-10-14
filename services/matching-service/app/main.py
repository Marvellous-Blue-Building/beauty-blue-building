from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import close_pool, get_pool
from app.routers.chat_understand import router as chat_understand_router
from app.routers.match_routine import router as match_routine_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(title="matching-service", lifespan=lifespan)
app.include_router(match_routine_router)
app.include_router(chat_understand_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
