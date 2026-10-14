# skin-scanning

FastAPI service that does **real** face detection and skin-metric computation
from a captured photo — no hardcoded/random scores. Replaces the old
`mock-scan-tool.html` iframe that posted a single fixed JSON blob back to the
Next.js app.

Uses MediaPipe's `FaceLandmarker` (468 3D face landmarks) + OpenCV to derive
6 zone crops (forehead, under-eye, L/R cheeks, nose/T-zone, chin) and compute
real pixel-level metrics per zone (luminance, specular highlights, edge/
texture variance, LAB color-space uniformity). It also derives the flagged
zones (zone, 0-100 concern score, plain-language description, heuristic
severity) shown on the diagnostic-report screen. The scaling constants and
severity bands are a reasonable heuristic calibration, not a clinically
validated dermatological model — same honesty standard as this project's RAG
product-matching pipeline.

The request/response contract is the native-engine spec merged in from the
wireframe prototype (`aaaa/backend/app/api/skin_scan.py` and
`aaaa/ARCHITECTURE_SPECIFICATION.md`), upgraded from a payload-echo stub to a
real server-side analyzer.

## Important: requires Python 3.12, not whatever `python3` resolves to

`mediapipe` does not yet support Python 3.14 (the version
`services/matching-service`'s venv uses). This service needs its own venv
built with Python 3.12 specifically.

## Setup

```
cd services/skin-scanning
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_model.py   # one-time: fetches models/face_landmarker.task (~3.7MB) from Google
cp .env.example .env
uvicorn app.main:app --reload --port 3003
```

Swagger UI: http://localhost:3003/docs

The Next.js app (`apps/web`) calls this service via `SKIN_SCAN_SERVICE_URL`
(see `apps/web/.env.local`) through `apps/web/lib/skin-scan-client.ts` and
`apps/web/app/api/scan-analyze/route.ts`. The `NativeSkinScanEngine` camera
component (`apps/web/components/scan/NativeSkinScanEngine.tsx`) captures a
frame and posts it to that proxy route — start this service before using the
skin-scan camera flow.

## Endpoint

`POST /analyze`

```json
{ "imageBase64": "data:image/jpeg;base64,..." }
```

Returns, on a detected face:

```json
{
  "hydration": 71.2,
  "elasticity": 84.0,
  "pigmentation": 68.5,
  "texture": 77.3,
  "pores": 62.1,
  "overall": 72.6,
  "scanId": "0f4d…",
  "status": "SUCCESS",
  "createdAt": "2026-10-14T02:56:49Z",
  "ragTriggerStatus": "READY_FOR_RECOMMENDATION",
  "flaggedZones": [
    {
      "zone": "Cheek Texture",
      "score": 34.2,
      "description": "Mild epidermal roughness & moisture depletion",
      "severity": "low"
    }
  ]
}
```

Returns `422` with `{"detail": "No face detected in the captured image."}`
if no face is found.
