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

LEGACY ONLY: REFERENCE mapped each raw measurement to a 0-100 score: a value at `good`
scores 95, at `poor` scores 45, linear in between and beyond (clamped to
5-99). The anchors are a first-pass calibration for phone/webcam captures,
not a clinically validated model — tune them on real scans with
scripts/calibrate.py. Version 3 retires these health scores and returns
nullable fields plus explicit image measurements; see measurement_report().
"""

import math
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


def spread(values: np.ndarray, mask: np.ndarray) -> float | None:
    """Robust standard deviation (from the median absolute deviation), so a
    stray hair or eyelash doesn't dominate a zone."""
    v = values[mask]
    if v.size < 120 or not np.isfinite(v).all():
        return None
    return float(1.4826 * np.median(np.abs(v - np.median(v))))


def region(zones: dict[str, np.ndarray], signals: SkinSignals, *names: str) -> np.ndarray:
    """Measurable pixels of the named zones, never substituting an unrelated region
    when the requested area is missing."""
    masks = [zones[name] for name in names if name in zones]
    if not masks:
        return np.zeros_like(signals.measurable)
    return np.logical_or.reduce(masks) & signals.measurable


def raw_measures(signals: SkinSignals, zones: dict[str, np.ndarray]) -> dict[str, float | None]:
    cheeks = region(zones, signals, "left_cheek", "right_cheek")
    upper_face = region(zones, signals, "forehead", "left_under_eye", "right_under_eye")
    nose = region(zones, signals, "nose")
    tone_spots = signals.dark_spots[region(zones, signals, "left_cheek", "right_cheek", "forehead")]
    return {
        "cheek_roughness": spread(signals.fine, cheeks),
        "cheek_texture": spread(signals.mid, cheeks),
        "nose_pores": spread(signals.fine + signals.mid, nose),
        "fine_lines": spread(signals.mid, upper_face),
        "tone_spots": float(np.percentile(tone_spots, 95)) if tone_spots.size >= 120 and np.isfinite(tone_spots).all() else None,
    }


def _score(value: float | None, good: float, poor: float) -> float | None:
    """Legacy calibration only. Missing or invalid signals never become scores."""
    if value is None or not math.isfinite(value) or value < 0 or poor <= good:
        return None
    return max(5.0, min(99.0, 95 - 50 * (value - good) / (poor - good)))


def compute_metrics(raw: dict[str, float | None]) -> dict[str, float | None]:
    """No validated mapping from image contrast to health scores exists yet.

    Keep nullable legacy fields so storage/matching clients can migrate without
    interpreting a missing value as healthy (99) or unhealthy (0).
    """
    return {key: None for key in (*REFERENCE, "overall")}


# Engineering eligibility gates, not calibrated diagnostic thresholds.
MIN_MEASUREMENT_PIXELS = 120
MIN_RETAINED_SKIN = 0.5
MIN_DETAIL_IOD = 128  # never infer micro-detail from an upscaled face
MEASUREMENT_REGIONS = {
    "cheek_roughness": ("left_cheek", "right_cheek"),
    "fine_lines": ("forehead", "left_under_eye", "right_under_eye"),
    "tone_spots": ("left_cheek", "right_cheek", "forehead"),
    "cheek_texture": ("left_cheek", "right_cheek"),
    "nose_pores": ("nose",),
}


def measurement_report(face: AlignedFace, signals: SkinSignals, zones: dict[str, np.ndarray]) -> dict:
    """Auditable image measurements; no health grade or fabricated confidence.

    Coverage is retained skin pixels / candidate skin pixels in the named
    regions. It is NOT a probability of correctness. Each required region must
    have enough finite, non-highlight samples; other regions cannot fill in.
    """
    raw = raw_measures(signals, zones)
    readings = []
    for key, names in MEASUREMENT_REGIONS.items():
        candidate_mask = np.zeros_like(signals.measurable)
        usable_mask = np.zeros_like(signals.measurable)
        reason = None
        for name in names:
            mask = zones.get(name)
            if mask is None:
                reason = "missing_region"
                continue
            total = int(mask.sum())
            usable = mask & signals.measurable
            count = int(usable.sum())
            candidate_mask |= mask
            usable_mask |= usable
            if count < MIN_MEASUREMENT_PIXELS or count < MIN_RETAINED_SKIN * total:
                reason = reason or "insufficient_skin"
            # Clipped highlights lose image detail even when warm enough to
            # escape the neutral-white shine detector.
            if count and np.mean(np.max(face.image[usable], axis=1) >= 250) > 0.1:
                reason = reason or "overexposed"
        if not math.isfinite(face.iod_px) or face.iod_px < MIN_DETAIL_IOD:
            reason = "low_resolution"
        candidate = int(candidate_mask.sum())
        pixels = int(usable_mask.sum())
        value = raw[key]
        if value is None or not math.isfinite(value) or value < 0:
            reason = reason or "invalid_signal"
        readings.append({
            "key": key, "value": round(value, 3) if reason is None else None,
            "unit": "log_contrast", "status": "measured" if reason is None else "unavailable",
            "reason": reason, "source": "front", "regions": list(names),
            "samplePixels": pixels,
            "coverage": round(pixels / candidate, 3) if candidate else 0.0,
        })
    return {
        **compute_metrics(raw),
        "measurementVersion": "image-contrast-v1",
        "measurementStatus": "complete" if all(r["status"] == "measured" for r in readings)
            else "partial" if any(r["status"] == "measured" for r in readings) else "unavailable",
        "measurements": readings,
    }
