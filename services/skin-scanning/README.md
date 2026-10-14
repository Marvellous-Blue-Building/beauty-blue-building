# skin-scanning

FastAPI service that does **real** face detection and skin-metric computation
from a captured photo — no hardcoded/random scores. Replaces the old
`mock-scan-tool.html` iframe that posted a single fixed JSON blob back to the
Next.js app.

How a photo is scored (scoring version 2):

1. **Find the face** — MediaPipe's `FaceLandmarker` (`app/face_landmarks.py`).
2. **Align it** (`app/alignment.py`) — rotate so the eyes are level and scale
   so the eye centers are 128 px apart, so camera resolution, distance and
   head tilt don't change the measurements. A skin mask drops eyes, brows,
   lips, hair, beard and shadows.
3. **Check the photo** (`app/quality.py`) — too small, too dark or too
   blurry photos are rejected with a reason instead of being scored.
4. **Measure skin zones** (`app/zones.py`, `app/metrics.py`) — forehead,
   under-eyes, cheeks and nose, placed from the person's own features. All
   measurements are relative to the person's own skin (log-luminance
   contrast), so skin tone and overall brightness don't move the scores.
   Shine (bright, colorless highlights — the v1.1 spec's Gate 5) is kept out
   of every score and reported as its own "forehead shine" flag.
5. **Flag areas** (`app/flags.py`) — up to 3 areas that stand out, each with
   a stable `key`, severity and position in the photo; nothing is flagged
   when nothing stands out.

Each score maps one raw measurement through a reference table (`REFERENCE`
in `app/metrics.py`): the value scoring 95 and the value scoring 45. Those
anchors are a first-pass calibration, not a clinically validated
dermatological model — same honesty standard as this project's RAG
product-matching pipeline. Tune them on real captures with:

```
python scripts/calibrate.py path/to/photos/ --overlay out/
```

which prints each photo's raw measurements, scores and flags, and (with
`--overlay`) saves the aligned face with its zones outlined.

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

Before capture, the component runs the v1.1 spec's live validation gates in
the browser (light/glare, sharpness, head pose, color cast — see
`apps/web/lib/scan/quality-gates.ts`) and auto-captures once they've all
passed for 1.2 s. The pose gate uses MediaPipe's in-browser FaceLandmarker
(`apps/web/lib/scan/face-landmarker.ts`), loaded on first visit from jsDelivr
plus the same model this service downloads. The gates only decide *when* to
capture; every score still comes from this service.

## Endpoint

`POST /analyze`

```json
{ "imageBase64": "data:image/jpeg;base64,..." }
```

Returns, on a detected face:

```json
{
  "hydration": 88.4,
  "elasticity": 86.9,
  "pigmentation": 79.1,
  "texture": 91.0,
  "pores": 84.2,
  "overall": 85.9,
  "scoringVersion": 2,
  "scanId": "0f4d…",
  "status": "SUCCESS",
  "createdAt": "2026-10-14T02:56:49Z",
  "ragTriggerStatus": "READY_FOR_RECOMMENDATION",
  "flaggedZones": [
    {
      "key": "nose_pores",
      "zone": "Nose pores",
      "score": 42.0,
      "description": "Moderate pore visibility around the nose",
      "severity": "medium",
      "x": 0.502,
      "y": 0.561
    }
  ]
}
```

`key` is one of `forehead_shine`, `under_eye`, `cheek_texture`,
`cheek_redness`, `nose_pores` (the web app localizes from it); `x` / `y` are
the area's 0-1 position in the submitted photo. `scoringVersion` changes
whenever the scoring does — scores from different versions aren't on the
same scale.

When a photo can't be scored it returns `422` with
`{"detail": {"code": "...", "message": "..."}}`, where `code` is `no_face`,
`face_too_small`, `no_skin`, `too_dark` or `too_blurry`.
