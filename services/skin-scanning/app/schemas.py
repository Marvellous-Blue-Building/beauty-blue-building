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
    # Stable identifier (e.g. "nose_pores") the web app localizes from;
    # `zone` / `description` stay as English fallbacks for stored reports.
    key: str = ""
    zone: str
    score: float = Field(description="0-100 concern score for this zone")
    description: str
    severity: Severity = "low"
    # Where the area is, as a 0-1 position in the analyzed photo (for
    # placing a marker on it).
    x: float | None = None
    y: float | None = None


class ScanMetrics(BaseModel):
    hydration: float
    elasticity: float
    pigmentation: float
    texture: float
    pores: float
    overall: float


# Bumped whenever the scoring changes, so scores from different versions
# aren't compared as if they were on the same scale.
SCORING_VERSION = 2


class ScanReport(ScanMetrics):
    scoringVersion: int = SCORING_VERSION
    scanId: str
    status: str
    createdAt: datetime
    ragTriggerStatus: str
    flaggedZones: list[FlaggedZone] = []
