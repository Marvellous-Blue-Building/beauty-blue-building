"""One scan, three readings -- the widget's and /scan's beauty scan.

The scan has three poses: a short burst facing the camera, then a photo
turned to the user's right and one turned to their left (app/beauty/poses.py).
It is read as three analyses:

- colour analysis (season) over every front frame that faces the camera,
- face shape over every front frame that is straight and expression-neutral,
- skin analysis on the sharpest of those frames, each cheek read instead
  from the side photo that faces it when that photo passed its pose check.

The side photos are optional: without them (an uploaded photo, an older
client) the scan is front-only, as before.

The same frame also gets this service's own skin scores (/analyze), so the
existing routine matching keeps working off one scan.
"""

import uuid
from datetime import datetime, timezone

import cv2
import numpy as np

from app.alignment import align_face
from app.beauty import colour, face_shape, poses, skin
from app.beauty.face_shape import head_pose, is_neutral, pose_allows_reading, pose_allows_shape
from app.beauty.vision import FaceFrame, analyse_frame, segmenter_available
from app.flags import compute_flagged_zones
from app.metrics import compute_metrics, raw_measures, skin_signals
from app.quality import check_photo_quality
from app.schemas import ScanReport
from app.zones import extract_zones

MAX_FRAMES = 12
MAX_SIDE_FRAMES = 4
CAVEAT = (
    "Hasil kosmetik perkiraan dari satu pindaian wajah depan, bukan diagnosis. "
    "Pencahayaan memengaruhi warna, jadi anggap ini titik awal."
)


class BeautyScanError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _sharpness(frame: FaceFrame) -> float:
    pts = frame.landmarks[:, :2] * [frame.width, frame.height]
    x0, y0 = np.maximum(pts.min(axis=0).astype(int), 0)
    x1, y1 = pts.max(axis=0).astype(int)
    face = frame.rgb[y0 : max(y0 + 1, y1), x0 : max(x0 + 1, x1)]
    if face.size == 0:
        return 0.0
    return float(cv2.Laplacian(cv2.cvtColor(face, cv2.COLOR_RGB2GRAY), cv2.CV_64F).var())


def _best_front(frames: list[FaceFrame]) -> FaceFrame:
    """The sharpest frame that is straight and neutral, else the sharpest that
    at least faces the camera, else the sharpest."""
    poses = [(f, head_pose(f)) for f in frames]
    straight = [f for f, p in poses if p is not None and pose_allows_shape(p) and is_neutral(f)]
    facing = [f for f, p in poses if p is not None and pose_allows_reading(p)]
    return max(straight or facing or frames, key=_sharpness)


def _plain(value):
    """numpy scalars and arrays to JSON-friendly Python values."""
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    return value


def _best_side(images: list[np.ndarray], pose: str) -> tuple[FaceFrame | None, dict]:
    """The sharpest side frame that is turned the asked way, and what was found."""
    checked = []
    for img in images[:MAX_SIDE_FRAMES]:
        frame = analyse_frame(img)
        if frame is None:
            checked.append((None, "no_face", None))
            continue
        ok, reason, reading = poses.check_side(frame, pose)
        checked.append((frame if ok else None, reason, reading))
    good = [c for c in checked if c[0] is not None]
    if good:
        frame, reason, reading = max(good, key=lambda c: _sharpness(c[0]))
    else:
        # Report the most telling refusal: a measured wrong turn over a missing face.
        frame, reason, reading = next((c for c in checked if c[2] is not None), checked[0] if checked else (None, "missing", None))
    info = {
        "pose": pose,
        "visibleCheek": poses.VISIBLE_CHEEK[pose],
        "received": len(images[:MAX_SIDE_FRAMES]),
        "accepted": frame is not None,
        "reason": reason,
        "yawDegrees": round(reading.yaw, 1) if reading else None,
    }
    return frame, info


def analyse(images: list[np.ndarray], sides: dict[str, list[np.ndarray]] | None = None) -> dict:
    """`images` is the front burst; `sides` optionally holds the "right" and
    "left" photos (a few frames each)."""
    frames = [f for f in (analyse_frame(img) for img in images[:MAX_FRAMES]) if f is not None]
    if not frames:
        raise BeautyScanError("no_face", "No face detected in the captured image.")

    best = _best_front(frames)

    # The same photo-quality gate as /analyze, on the photo the skin is read from.
    # Raises app.quality.PhotoQualityError.
    bgr = cv2.cvtColor(best.rgb, cv2.COLOR_RGB2BGR)
    aligned = align_face(bgr, [(int(x * best.width), int(y * best.height)) for x, y, _ in best.landmarks])
    signals = skin_signals(aligned)
    check_photo_quality(aligned, signals)
    zones = extract_zones(aligned)
    raw = raw_measures(signals, zones)
    metrics = ScanReport(
        scanId=str(uuid.uuid4()),
        status="SUCCESS",
        createdAt=datetime.now(timezone.utc),
        ragTriggerStatus="READY_FOR_RECOMMENDATION",
        flaggedZones=compute_flagged_zones(aligned, signals, zones, raw),
        **compute_metrics(raw),
    )

    side_frames: dict[str, FaceFrame] = {}
    pose_info = [{
        "pose": "front",
        "visibleCheek": "both",
        "received": len(images[:MAX_FRAMES]),
        "accepted": True,
        "reason": "ok",
        "yawDegrees": round(t.yaw, 1) if (t := poses.turn(best)) else None,
    }]
    for pose in ("right", "left"):
        if not (sides or {}).get(pose):
            continue
        frame, info = _best_side(sides[pose], pose)
        pose_info.append(info)
        if frame is not None:
            side_frames[pose] = frame

    colour_result = colour.analyse(frames)
    shape = face_shape.analyse(frames, colour_result.head_covered)
    skin_result = skin.analyse(best, side_frames)

    return _plain({
        "schemaVersion": 1,
        "kind": "bluebuilding.beauty-scan",
        "scanId": str(uuid.uuid4()),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "captureMode": skin_result["captureMode"],
        "language": "id",
        "frames": {
            "received": len(images[:MAX_FRAMES]),
            "withFace": len(frames),
            "segmenter": segmenter_available(),
        },
        "poses": pose_info,
        "colour": colour_result.payload,
        "faceShape": shape,
        "skin": skin_result,
        "skinMetrics": metrics.model_dump(mode="json"),
        "caveat": CAVEAT,
    })
