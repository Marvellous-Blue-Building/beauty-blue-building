from typing import Literal

from pydantic import BaseModel, Field


class AdviseRequest(BaseModel):
    message: str = Field(min_length=1)
    # Grounding context from services/matching-service's /chat/understand
    # pipeline (docs/plan.md SS4 steps 1-13) — optional so /advise still
    # works standalone with no caller-supplied context.
    recognizedEntities: list[str] = []
    candidateProducts: list[str] = []
    conversationContext: list[str] = []
    # Reply language — Indonesian by default (the app's AI Advisor rule); the
    # embeddable widget sends "en" when its host page is English.
    language: Literal["id", "en"] = "id"


class AdviseResponse(BaseModel):
    reply: str


class NavIntentRequest(BaseModel):
    message: str = Field(min_length=1)


class NavIntentResponse(BaseModel):
    navButtons: list[dict[str, str]] = []


class InsightRequest(BaseModel):
    message: str = Field(min_length=1)
    # Preformatted sales/event/alert data block assembled by apps/web from
    # Postgres (see app/api/admin/insight/route.ts) — the model reasons
    # only over what's given here, never invents numbers.
    dataContext: str = ""
    conversationContext: list[str] = []
    # Reply language — the admin dashboard's UI locale ("id" | "en").
    language: str = "id"


class InsightResponse(BaseModel):
    reply: str
