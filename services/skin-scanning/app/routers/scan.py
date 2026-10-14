"""Native skin-scan endpoint.

The metric computation itself is genuinely derived from the uploaded photo's
pixels (face detection + per-zone CV, see app/face_landmarks.py,
app/zones.py, app/metrics.py, app/flags.py) — no hardcoded/random scores.
This endpoint is the native engine merged in from the wireframe prototype
(`aaaa/backend/app/api/skin_scan.py`), upgraded from a payload-echo stub to
the real server-side analyzer.
"""

import base64
import re
import uuid
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException

from app.face_landmarks import detect_face
from app.flags import compute_flagged_zones
from app.metrics import compute_metrics
from app.schemas import ScanAnalyzeRequest, ScanReport
from app.zones import extract_zones

router = APIRouter()

_DATA_URL_PREFIX = re.compile(r"^data:image/\w+;base64,")


def _decode_image(image_base64: str) -> np.ndarray:
    raw = _DATA_URL_PREFIX.sub("", image_base64)
    try:
        image_bytes = base64.b64decode(raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.") from exc

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image data.")
    return image


@router.post("/analyze", response_model=ScanReport)
async def analyze(body: ScanAnalyzeRequest) -> ScanReport:
    image = _decode_image(body.imageBase64)

    landmarks = detect_face(image)
    if landmarks is None:
        raise HTTPException(status_code=422, detail="No face detected in the captured image.")

    zones = extract_zones(image, landmarks)
    scores = compute_metrics(zones)
    flagged_zones = compute_flagged_zones(zones)

    return ScanReport(
        scanId=str(uuid.uuid4()),
        status="SUCCESS",
        createdAt=datetime.now(timezone.utc),
        ragTriggerStatus="READY_FOR_RECOMMENDATION",
        flaggedZones=flagged_zones,
        **scores,
    )
