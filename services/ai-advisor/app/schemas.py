from pydantic import BaseModel, Field


class AdviseRequest(BaseModel):
    message: str = Field(min_length=1)
    # Grounding context from services/matching-service's /chat/understand
    # pipeline (docs/plan.md SS4 steps 1-13) — optional so /advise still
    # works standalone with no caller-supplied context.
    recognizedEntities: list[str] = []
    candidateProducts: list[str] = []
    conversationContext: list[str] = []


class AdviseResponse(BaseModel):
    reply: str
