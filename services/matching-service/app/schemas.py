"""Pydantic mirrors of apps/web/types/quiz.ts, types/scan.ts, types/product.ts
and the MatchedRoutine shape formerly in apps/web/lib/rag/match-routine.ts.
Field names are camelCase on purpose, matching the JSON wire format the
Next.js app already sends/expects — no alias indirection needed."""

from typing import Literal, Optional

from pydantic import BaseModel

SkinType = Literal["Oily", "Dry", "Combination", "Sensitive", "Normal", "Not sure"]

Concern = Literal[
    "Acne & Breakouts",
    "Fine Lines & Aging",
    "Dark Spots / Hyperpigmentation",
    "Dryness & Dehydration",
    "Redness & Irritation",
    "Large Pores",
]

Sensitivity = Literal[
    "Fragrance",
    "Retinoids",
    "Essential Oils",
    "Eczema-prone skin",
    "Chemical Sunscreens",
    "None of these",
]

Climate = Literal["Humid", "Dry/Cold"]

Goal = Literal["Clear Skin", "Anti-Aging", "Even Tone", "Hydration"]

ProductTag = Literal["Vegan", "Cruelty-Free", "Fragrance-Free"]

Confidence = Literal["high", "medium", "low"]


class EthicalPreferences(BaseModel):
    vegan: bool
    crueltyFree: bool
    fragranceFree: bool


class QuizAnswers(BaseModel):
    skinType: Optional[SkinType] = None
    concerns: list[Concern] = []
    sensitivities: list[Sensitivity] = []
    climate: Optional[Climate] = None
    budget: float
    ethics: EthicalPreferences
    goal: Optional[Goal] = None


class ScanMetrics(BaseModel):
    hydration: float | None = None
    elasticity: float | None = None
    pigmentation: float | None = None
    texture: float | None = None
    pores: float | None = None
    overall: float | None = None


class InciIngredient(BaseModel):
    name: str
    flagged: Optional[bool] = None


class CompatibilityNote(BaseModel):
    label: str
    ok: bool


class Product(BaseModel):
    id: str
    sku: str
    parentSku: str
    name: str
    brand: str
    imageUrl: Optional[str] = None
    sizeLabel: Optional[str] = None
    price: float
    listedPrice: Optional[float] = None
    variantCount: int
    rating: Optional[float] = None
    totalReview: Optional[int] = None
    category: str
    stockQuantity: int
    tags: list[ProductTag] = []
    matchPercent: Optional[float] = None
    description: str
    inci: list[InciIngredient] = []
    compatibility: list[CompatibilityNote] = []
    colorHex: Optional[str] = None
    colorName: Optional[str] = None
    colorPalette: list[str] = []


class MatchedRoutineStep(BaseModel):
    stepNumber: int
    why: str
    confidence: Confidence
    product: Product


class MatchedRoutine(BaseModel):
    am: list[MatchedRoutineStep]
    pm: list[MatchedRoutineStep]


class MatchRoutineRequest(BaseModel):
    quiz: QuizAnswers
    scan: Optional[ScanMetrics] = None
    # Product-type keywords from services/geotagging-weather's combined
    # holiday+weather formula (e.g. "Broad-Spectrum SPF 50+ Sunscreens") —
    # boosts matching products the same way scan-metric keywords already do.
    boostKeywords: list[str] = []
    # When present, app/routers/match_routine.py also folds in recognized
    # entities from this user's own past chat messages and boost keywords
    # from their last several real skin scans — not just the single
    # quiz/scan this particular request carries. See app/user_history.py.
    userId: Optional[str] = None


Intent = Literal["product_recommendation", "ingredient_inquiry", "routine_advice", "general_question"]


class ChatUnderstandRequest(BaseModel):
    conversationId: Optional[str] = None
    text: str
    # Plain-language holiday/weather skincare guidance from
    # services/geotagging-weather, appended to the LLM's reasoning context —
    # see app/chat_pipeline.py's understand_chat_message.
    environmentalContext: Optional[str] = None
    # Same formula's product-type keywords, boosting candidate retrieval —
    # mirrors MatchRoutineRequest.boostKeywords.
    boostKeywords: list[str] = []
    # When present, app/chat_pipeline.py also folds in recognized entities
    # from this user's own past chat messages (across every conversation,
    # not just this one) and boost keywords from their last several real
    # skin scans. See app/user_history.py.
    userId: Optional[str] = None
    # Reply language for the deterministic reply text. Indonesian by default
    # (the app's AI Advisor rule); the embeddable widget sends "en" when its
    # host page is English.
    language: Literal["id", "en"] = "id"


class ChatUnderstanding(BaseModel):
    """Structured Understanding Object — docs/plan.md SS4 step 13. The
    chat-pipeline equivalent of MatchedRoutine, for free-text chat input
    instead of structured quiz input."""

    normalizedText: str
    recognizedEntities: list[str] = []
    intent: Intent
    confidence: Confidence
    isAmbiguous: bool
    reply: Optional[str] = None
    topCandidate: Optional[Product] = None
    # Up to 6 closest-ranked items for the chat UI's full-width product
    # list below the bot bubble (see chat_pipeline.py's _retrieve_candidates).
    candidates: list[Product] = []
    conversationContext: list[str] = []
