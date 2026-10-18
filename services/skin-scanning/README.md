# Skin scanning — version 3 measurement contract

The current engine returns **visual image measurements**, not a 0–100 skin-health grade. Hydration, elasticity and the legacy score fields are null. Missing areas, insufficient usable pixels, low original resolution and clipped/non-finite samples are explicitly unavailable with reasons. The widget, app report and PDF show the evidence and sample coverage; coverage is not confidence.

See [measurement integrity and validation plan](../../docs/scan-measurement-validation.md) for the units, eligibility gates, compatibility and the real-world work required before accuracy claims. Run `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` for the integrity regressions. Deploy the matching-service nullable schema with this version.

The material below documents the original v2 setup and historical payloads. Its 0–100 score mapping is **retired**, not the current API behavior.

---

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
python scripts/download_model.py   # one-time: fetches models/face_landmarker.task (~3.7MB) and models/selfie_multiclass_256x256.tflite (~16MB) from Google
cp .env.example .env
uvicorn app.main:app --reload --port 3003
```

Swagger UI: http://localhost:3003/docs

The Next.js app (`apps/web`) calls this service via `SKIN_SCAN_SERVICE_URL`
(see `apps/web/.env.local`). The `NativeSkinScanEngine` camera component
(`apps/web/components/scan/NativeSkinScanEngine.tsx`) takes the three-pose
beauty scan (below) and posts it to `apps/web/app/api/scan-beauty/route.ts`;
an uploaded photo goes the same way as a front-only scan. `/analyze` is still
there for single photos (`apps/web/lib/skin-scan-client.ts`). Start this
service before using the scan camera.

Before each photo, the component runs the v1.1 spec's live validation gates
in the browser (light/glare, sharpness, head pose, color cast — see
`apps/web/lib/scan/quality-gates.ts`) plus the pose's head angle
(`apps/web/lib/scan/pose-steps.ts`), and takes it once they've all passed for
about a second. The pose gates use MediaPipe's in-browser FaceLandmarker
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

## Beauty scan: colour season, face shape and skin type in one scan

`POST /analyze-beauty` — used by the app's `/scan` camera
(`apps/web/components/scan/NativeSkinScanEngine.tsx` → `apps/web/app/api/scan-beauty`)
and the embeddable widget (`apps/web/public/widget-loader.js` →
`apps/web/app/api/widget/beauty-analyze`). It runs three analyses
(`app/beauty/`) over one scan in three poses — facing the camera, turned
right, turned left:

```json
{
  "frames": ["data:image/jpeg;base64,...", "..."],
  "right": ["data:image/jpeg;base64,..."],
  "left": ["data:image/jpeg;base64,..."],
  "language": "en"
}
```

- `frames` — 1 to 12 frames facing the camera (the clients send a burst of
  6-8 taken while the pose is held).
- `right` / `left` — optional, up to 4 frames each, turned to the user's own
  right / left. A head turned right shows the camera the **left** cheek, so the
  right-turn photo is where `pipi_kiri` is read from.
- `language` — `id` (default, Indonesian) or `en` (`app/beauty/english.py`).
  Only the words change; keys and numbers are the same.

All frames not mirrored.

- **Colour season** (`app/beauty/colour.py`) — cheek and hairline patches on
  every front frame that faces the camera, white-balanced against the hair (or
  the room), read onto depth / clarity / undertone and matched to the nearest
  of 12 seasons, with confidence, a runner-up and the season's makeup palette.
- **Face shape** (`app/beauty/face_shape.py`) — six proportions over every
  straight, expression-neutral front frame (at least 4), placed within
  population norms and matched to one of seven shapes, plus a look guide
  (which of five makeup looks needs the least adjustment; the look photos are
  served by the web app from `apps/web/public/beauty/looks`). When too few frames
  pass, slightly off-angle or not-quite-neutral frames are used instead and
  the shape comes back with `source.quality: "approximate"` and an
  `approximateNote`, rather than no shape at all. `source.angles` records the
  frames' median yaw / pitch / roll and why frames were refused, for tuning.
- **Skin type** (`app/beauty/skin.py`) — five regions scored for shine,
  evenness, pores, spots, acne and fine lines, answering a skin-type
  questionnaire (oil points, then a sensitivity check from cheek flush). Forehead, nose and chin come from the sharpest front frame;
  each cheek from the side photo facing it, or the front photo without one
  (`analysis.detail[].source` says which).
- **Skin scores** — the front frame also gets this service's own `/analyze`
  scores (`skinMetrics`), so routine matching works off the same scan.

**The poses** (`app/beauty/poses.py`). The clients guide each pose live. The
front photo is held to this service's face-shape gates (yaw ≤ 10°, roll ≤ 10°,
pitch within 20° of level, no clear smile / open mouth / raised brows), so a
front frame the camera takes is one the face shape can read. The side photos
need a natural turn: 20°-60° toward the asked side, roll ≤ 20°, no nod check.
The server re-checks only the turn
of each side photo, more leniently (15°-70° the asked way) — enough to catch a
photo taken facing the wrong way or barely turned, which is then not used.
`poses[]` reports each pose's measured yaw and whether it was used.

`models/selfie_multiclass_256x256.tflite` (hair / skin / clothes
segmentation) tells hair from a hijab or the background; without it the
colour analysis judges hair by colour alone.

The response is `{schemaVersion, kind: "bluebuilding.beauty-scan", scanId,
createdAt, captureMode, language, frames, poses, colour, faceShape, skin,
skinMetrics, caveat}`; `captureMode` is `three-pose`, `front+right`,
`front+left` or `single-front`. A reading that cannot be made comes back with
`season` / `shape` set to `null` and a `remedyText` saying what to change. A
scan with no usable face returns the same `422` codes as `/analyze`.

The population norms, palettes, look notes, skin thresholds and pose limits
are provisional until calibrated on real scans. The pitch window is centred
on 18°, because level frontal faces read 18-19.5° on this mesh, and is ±20°,
because real webcam scans landed just outside 15° — the measurements are 3D
distances, so a moderate nod barely moves them.
