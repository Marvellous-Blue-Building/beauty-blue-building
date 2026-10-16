"""Skin-tone / undertone extraction for color (shade) matching.

Reuses the exact same skin mask the rest of this service already computes
in app/alignment.py's align_face() (already excludes eyes/brows/lips, keeps
intentional highlights) — this is NOT a new detector, just a new use of the
already-aligned face.

Undertone classification is a first-pass calibration (ITA deg / hue-angle
heuristic), not clinically validated — same honesty standard the rest of
this service holds itself to (see app/metrics.py's own comments about its
reference anchors). Good enough for a shade-matching suggestion, not a
medical or cosmetic-lab-grade tool.
"""

from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np

from app.alignment import AlignedFace

Undertone = Literal["warm", "cool", "neutral"]
DepthCategory = Literal["fair", "light", "medium", "tan", "deep"]


@dataclass
class SkinColor:
    l: float
    a: float
    b: float
    hex: str
    ita: float
    undertone: Undertone
    depth: DepthCategory


def _lab_to_hex(l: float, a: float, b: float) -> str:
    lab = np.array([[[l, a, b]]], dtype=np.float32)
    bgr = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)[0, 0] * 255.0
    bgr = np.clip(bgr, 0, 255).astype(np.uint8)
    r, g, b_ = int(bgr[2]), int(bgr[1]), int(bgr[0])
    return f"#{r:02X}{g:02X}{b_:02X}"


def _depth_category(ita: float) -> DepthCategory:
    if ita > 55:
        return "fair"
    if ita > 41:
        return "light"
    if ita > 28:
        return "medium"
    if ita > 10:
        return "tan"
    return "deep"


def _undertone(a: float, b: float) -> Undertone:
    hue = float(np.degrees(np.arctan2(b, a)))
    if hue < 0:
        hue += 360
    if hue < 40:
        return "cool"
    if hue > 60:
        return "warm"
    return "neutral"


def analyze_skin_color(face: AlignedFace) -> SkinColor:
    lab_image = cv2.cvtColor(face.image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
    pixels = lab_image[face.skin]
    l, a, b = (float(v) for v in np.median(pixels, axis=0))
    ita = float(np.degrees(np.arctan2(l - 50.0, b)))
    return SkinColor(
        l=l,
        a=a,
        b=b,
        hex=_lab_to_hex(l, a, b),
        ita=ita,
        undertone=_undertone(a, b),
        depth=_depth_category(ita),
    )
