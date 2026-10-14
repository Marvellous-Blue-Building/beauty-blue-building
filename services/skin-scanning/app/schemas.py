"""Request/response models for the native skin-scan engine.

The metric field names are the camelCase wire contract shared with
`apps/web/types/scan.ts` and `services/matching-service/app/schemas.py`, so a
scan report can be fed straight into the hybrid RAG routine-matching pipeline.
The envelope fields (scanId / status / flaggedZones / ragTriggerStatus) come
from the native engine spec merged in from the wireframe prototype
(`aaaa/backend/app/api/skin_scan.py`) and drive the diagnostic-report screen.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["low", "medium", "high"]


class ScanAnalyzeRequest(BaseModel):
    imageBase64: str


class FlaggedZone(BaseModel):
    zone: str
    score: float = Field(description="0-100 concern score for this zone")
    description: str
    severity: Severity = "low"


class ScanMetrics(BaseModel):
    hydration: float
    elasticity: float
    pigmentation: float
    texture: float
    pores: float
    overall: float


class ScanReport(ScanMetrics):
    scanId: str
    status: str
    createdAt: datetime
    ragTriggerStatus: str
    flaggedZones: list[FlaggedZone] = []
