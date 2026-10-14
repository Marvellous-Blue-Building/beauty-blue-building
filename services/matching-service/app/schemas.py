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
    hydration: float
    elasticity: float
    pigmentation: float
    texture: float
    pores: float
    overall: float


class InciIngredient(BaseModel):
    name: str
    flagged: Optional[bool] = None


class CompatibilityNote(BaseModel):
    label: str
    ok: bool


class Product(BaseModel):
    id: str
    sku: str
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
    tags: list[ProductTag] = []
    matchPercent: Optional[float] = None
    description: str
    inci: list[InciIngredient] = []
    compatibility: list[CompatibilityNote] = []


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
