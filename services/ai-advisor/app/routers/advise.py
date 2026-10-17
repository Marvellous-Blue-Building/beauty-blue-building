from fastapi import APIRouter, HTTPException

from app.gemini import generate_reply
from app.schemas import AdviseRequest, AdviseResponse

router = APIRouter()


@router.post("/advise", response_model=AdviseResponse)
def advise(payload: AdviseRequest):
    """Synchronous (not async def) on purpose — generation is CPU-bound and
    blocking, so FastAPI runs this handler in its threadpool instead of
    blocking the event loop."""
    text = payload.message.strip()
    if not text:
        raise HTTPException(status_code=422, detail="message must not be empty")
    try:
        reply = generate_reply(
            text,
            recognized_entities=payload.recognizedEntities,
            candidate_products=payload.candidateProducts,
            conversation_context=payload.conversationContext,
        )
    except Exception as exc:  # missing credentials / Gemini API failure — surface as 503, not a 500 stack trace
        raise HTTPException(status_code=503, detail=f"Gemini unavailable: {exc}") from exc
    return AdviseResponse(reply=reply)

