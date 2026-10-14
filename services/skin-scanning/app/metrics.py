"""Turns the aligned face's skin zones into the 5 report scores.

Every measurement is relative to the person's own skin, so it doesn't move
with skin tone or overall brightness:
- Luminance is measured in log space (100 * ln of linear-light luminance), so
  1 unit is ~1% contrast whether the skin is light or deep.
- Smooth shading from face shape and lighting is filtered out before
  measuring, and shine — bright, nearly colorless highlights (the v1.1 spec's
  Gate 5) — is left out of every score and reported as its own flag (see
  flags.py) instead of inflating hydration.

Detail measured, in the canonical frame (IOD = 128 px, roughly 2 px per mm):
- fine:       below ~1 px — micro-roughness, the dull/flaky look of dry skin
- mid:        ~1-4 px     — bumps, pores and fine lines
- dark spots: compact marks up to ~7 mm that are darker than the skin around
  them (a morphological black-hat, which ignores smooth shading)

REFERENCE maps each raw measurement to a 0-100 score: a value at `good`
scores 95, at `poor` scores 45, linear in between and beyond (clamped to
5-99). The anchors are a first-pass calibration for phone/webcam captures,
not a clinically validated model — tune them on real scans with
scripts/calibrate.py.
"""

from dataclasses import dataclass

import cv2
import numpy as np

from app.alignment import AlignedFace

SHINE_LUMA = 218  # Gate 5: brighter than this (0-255)...
SHINE_MAX_SATURATION = 0.20  # ...and less saturated than this is shine
SPOT_SIZE_PX = 15  # largest dark spot measured (~7 mm)

# metric: (raw measurement it's scored from, value scoring 95, value scoring 45)
REFERENCE: dict[str, tuple[str, float, float]] = {
    "hydration": ("cheek_roughness", 1.2, 3.5),
    "elasticity": ("fine_lines", 1.8, 5.0),
    "pigmentation": ("tone_spots", 4.0, 12.0),
    "texture": ("cheek_texture", 1.8, 5.0),
    "pores": ("nose_pores", 2.5, 6.5),
}


@dataclass
class SkinSignals:
    log_lum: np.ndarray  # 100 * ln(linear luminance)
    fine: np.ndarray
    mid: np.ndarray
    dark_spots: np.ndarray  # percent darker than the surrounding skin
    lab: np.ndarray  # float CIELAB (L 0-100)
    shine: np.ndarray  # bool: Gate 5 shine pixels
    measurable: np.ndarray  # bool: skin that isn't shine
    skin: np.ndarray  # bool: all skin, shine included


def _masked_blur(values: np.ndarray, mask: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur that only averages over `mask` pixels, so hair, eyes and
    background next to the skin don't bleed into it."""
    weight = mask.astype(np.float32)
    total = cv2.GaussianBlur(values * weight, (0, 0), sigma)
    norm = cv2.GaussianBlur(weight, (0, 0), sigma)
    return total / np.maximum(norm, 1e-3)


def skin_signals(face: AlignedFace) -> SkinSignals:
    bgr = face.image.astype(np.float32) / 255
    rgb = bgr[..., ::-1]
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    log_lum = 100 * np.log(linear @ np.float32([0.2126, 0.7152, 0.0722]) + 0.005)

    luma = 255 * (rgb @ np.float32([0.299, 0.587, 0.114]))
    brightest = bgr.max(axis=2)
    saturation = (brightest - bgr.min(axis=2)) / np.maximum(brightest, 1e-3)
    shine = face.skin & (luma > SHINE_LUMA) & (saturation < SHINE_MAX_SATURATION)
    # Leave a small margin around shine too: its bright halo isn't texture.
    shine_halo = cv2.dilate(shine.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    measurable = face.skin & ~shine_halo

    smooth_1 = _masked_blur(log_lum, measurable, 1.0)
    # Black-hat on the lightly smoothed skin: how much darker each pixel is
    # than a SPOT_SIZE_PX disc around it. Gaps are filled from nearby skin and
    # highlights are capped near the local level first, so a bright patch
    # can't make the skin next to it look like a dark spot.
    local = _masked_blur(log_lum, measurable, 8.0)
    filled = np.minimum(np.where(measurable, smooth_1, local), local + 4)
    disc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (SPOT_SIZE_PX, SPOT_SIZE_PX))
    return SkinSignals(
        log_lum=log_lum,
        fine=log_lum - smooth_1,
        mid=smooth_1 - _masked_blur(log_lum, measurable, 4.0),
        dark_spots=cv2.morphologyEx(filled, cv2.MORPH_BLACKHAT, disc),
        lab=cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB),
        shine=shine,
        measurable=measurable,
        skin=face.skin,
    )


def spread(values: np.ndarray, mask: np.ndarray) -> float:
    """Robust standard deviation (from the median absolute deviation), so a
    stray hair or eyelash doesn't dominate a zone."""
    v = values[mask]
    if v.size == 0:
        return 0.0
    return float(1.4826 * np.median(np.abs(v - np.median(v))))


def region(zones: dict[str, np.ndarray], signals: SkinSignals, *names: str) -> np.ndarray:
    """Measurable pixels of the named zones, falling back to all measurable
    skin if none of them is visible (e.g. a fringe covering the forehead)."""
    masks = [zones[name] for name in names if name in zones]
    if not masks:
        return signals.measurable
    return np.logical_or.reduce(masks) & signals.measurable


def raw_measures(signals: SkinSignals, zones: dict[str, np.ndarray]) -> dict[str, float]:
    cheeks = region(zones, signals, "left_cheek", "right_cheek")
    upper_face = region(zones, signals, "forehead", "left_under_eye", "right_under_eye")
    nose = region(zones, signals, "nose")
    tone_spots = signals.dark_spots[region(zones, signals, "left_cheek", "right_cheek", "forehead")]
    return {
        "cheek_roughness": spread(signals.fine, cheeks),
        "cheek_texture": spread(signals.mid, cheeks),
        "nose_pores": spread(signals.fine + signals.mid, nose),
        "fine_lines": spread(signals.mid, upper_face),
        "tone_spots": float(np.percentile(tone_spots, 95)) if tone_spots.size else 0.0,
    }


def _score(value: float, good: float, poor: float) -> float:
    return max(5.0, min(99.0, 95 - 50 * (value - good) / (poor - good)))


def compute_metrics(raw: dict[str, float]) -> dict[str, float]:
    scores = {
        metric: round(_score(raw[measure], good, poor), 1)
        for metric, (measure, good, poor) in REFERENCE.items()
    }
    scores["overall"] = round(sum(scores.values()) / len(scores), 1)
    return scores
