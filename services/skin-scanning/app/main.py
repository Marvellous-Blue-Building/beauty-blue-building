from fastapi import FastAPI

from app.routers.beauty import router as beauty_router
from app.routers.color import router as color_router
from app.routers.scan import router as scan_router

app = FastAPI(title="skin-scanning")
app.include_router(scan_router)
app.include_router(color_router)
app.include_router(beauty_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
