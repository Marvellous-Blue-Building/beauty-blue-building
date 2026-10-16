from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402

from app.gemma import is_loaded  # noqa: E402
from app.routers.advise import router as advise_router  # noqa: E402
from app.routers.nav_intent import router as nav_intent_router  # noqa: E402

app = FastAPI(title="ai-advisor")
app.include_router(advise_router)
app.include_router(nav_intent_router)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": is_loaded()}
