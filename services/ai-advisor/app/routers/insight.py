from fastapi import APIRouter, HTTPException

from app.insight import generate_insight_reply
from app.schemas import InsightRequest, InsightResponse

router = APIRouter()


@router.post("/insight", response_model=InsightResponse)
def insight(payload: InsightRequest):
    """Vera Intelligence — admin-dashboard analytics chat. See app/insight.py."""
    text = payload.message.strip()
    if not text:
        raise HTTPException(status_code=422, detail="message must not be empty")
    try:
        reply = generate_insight_reply(
            text,
            data_context=payload.dataContext,
            conversation_context=payload.conversationContext,
        )
    except Exception as exc:  # missing credentials / Gemini API failure — surface as 503, not a 500 stack trace
        raise HTTPException(status_code=503, detail=f"Gemini unavailable: {exc}") from exc
    return InsightResponse(reply=reply)
