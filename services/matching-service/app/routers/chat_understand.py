from fastapi import APIRouter

from app.chat_pipeline import understand_chat_message
from app.schemas import ChatUnderstanding, ChatUnderstandRequest

router = APIRouter()


@router.post("/chat/understand", response_model=ChatUnderstanding)
async def post_chat_understand(body: ChatUnderstandRequest) -> ChatUnderstanding:
    return await understand_chat_message(
        body.text,
        body.conversationId,
        environmental_context=body.environmentalContext,
        boost_keywords=body.boostKeywords,
    )
