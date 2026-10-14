from fastapi import FastAPI

from app.routers.scan import router as scan_router

app = FastAPI(title="skin-scanning")
app.include_router(scan_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
