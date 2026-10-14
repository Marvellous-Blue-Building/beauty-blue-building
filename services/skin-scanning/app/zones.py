"""Places the skin zones (forehead, under-eyes, cheeks, nose) on the aligned
face, anchored to the person's own features: brows, eyes, nose and face
outline. Each zone is a box in canonical coordinates intersected with the
skin mask, so hair, beard, lashes and shadows are never measured.

The chin isn't measured: stubble and beard shadow there read as "texture" no
matter what the skin is like.
"""

import numpy as np

from app.alignment import (
    FACE_OVAL,
    IOD,
    LEFT_BROW,
    LEFT_EYE,
    NOSE,
    RIGHT_BROW,
    RIGHT_EYE,
    AlignedFace,
)

ZONE_NAMES = (
    "forehead",
    "left_under_eye",
    "right_under_eye",
    "left_cheek",
    "right_cheek",
    "nose",
)

# A zone with fewer skin pixels than this (e.g. a forehead under a fringe) is
# treated as not visible rather than measured from a handful of pixels.
MIN_ZONE_PIXELS = 120


def _box(face: AlignedFace, x0: float, x1: float, y0: float, y1: float) -> np.ndarray:
    h, w = face.skin.shape
    box = np.zeros_like(face.skin)
    xa, xb = max(0, int(x0)), min(w, int(np.ceil(x1)))
    ya, yb = max(0, int(y0)), min(h, int(np.ceil(y1)))
    if xb > xa and yb > ya:
        box[ya:yb, xa:xb] = True
    return box & face.skin


def extract_zones(face: AlignedFace) -> dict[str, np.ndarray]:
    """Boolean pixel masks for each zone, keyed by ZONE_NAMES. Zones that
    aren't visible enough are left out."""
    lm = face.landmarks
    u = IOD

    eyes = sorted((lm[LEFT_EYE], lm[RIGHT_EYE]), key=lambda g: g[:, 0].mean())
    brow_top = min(lm[LEFT_BROW][:, 1].min(), lm[RIGHT_BROW][:, 1].min())
    oval_top = lm[FACE_OVAL][:, 1].min()
    nose_cx = float(np.median(lm[NOSE][:, 0]))
    nose_bottom = lm[NOSE][:, 1].max()
    eye_line = np.mean([g[:, 1].mean() for g in eyes])

    zones = {
        "forehead": _box(
            face,
            nose_cx - 0.55 * u,
            nose_cx + 0.55 * u,
            oval_top + 0.15 * (brow_top - oval_top),
            brow_top - 0.06 * u,
        ),
        # "left" / "right" are image sides throughout (mirror of the person's).
        **{
            f"{side}_under_eye": _box(
                face,
                eye[:, 0].mean() - 0.28 * u,
                eye[:, 0].mean() + 0.28 * u,
                eye[:, 1].max() + 0.07 * u,
                eye[:, 1].max() + 0.27 * u,
            )
            for side, eye in zip(("left", "right"), eyes)
        },
        # Under each pupil, from below the under-eye area to the base of the
        # nose; the inner edge stops short of the nose and smile lines.
        "left_cheek": _box(
            face,
            eyes[0][:, 0].mean() - 0.32 * u,
            eyes[0][:, 0].mean() + 0.12 * u,
            eyes[0][:, 1].max() + 0.35 * u,
            nose_bottom + 0.05 * u,
        ),
        "right_cheek": _box(
            face,
            eyes[1][:, 0].mean() - 0.12 * u,
            eyes[1][:, 0].mean() + 0.32 * u,
            eyes[1][:, 1].max() + 0.35 * u,
            nose_bottom + 0.05 * u,
        ),
        "nose": _box(
            face,
            nose_cx - 0.11 * u,
            nose_cx + 0.11 * u,
            eye_line + 0.35 * u,
            nose_bottom - 0.08 * u,
        ),
    }
    return {name: mask for name, mask in zones.items() if mask.sum() >= MIN_ZONE_PIXELS}
