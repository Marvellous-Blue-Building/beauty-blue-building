"""Turns the real per-zone pixel measurements (same ones `metrics.py` uses)
into human-readable flagged-zone items for the diagnostic report: which
zones look most worth attention, a 0-100 concern score, a plain-language
description, and a heuristic severity band.

Like `metrics.py`, the banding thresholds are a reasonable cosmetic triage
heuristic calibrated for readability — not a clinically validated
dermatological grading scale (see metrics.py's docstring).
"""

import numpy as np

from app.metrics import (
    _lab_color_variance,
    _laplacian_variance,
    _mean_luminance,
    _specular_ratio,
)
from app.schemas import FlaggedZone


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _severity(concern: float) -> str:
    if concern >= 0.66:
        return "high"
    if concern >= 0.4:
        return "medium"
    return "low"


def _describe(concern: float) -> str:
    return "prominent" if concern >= 0.66 else "moderate" if concern >= 0.4 else "mild"


def compute_flagged_zones(zones: dict[str, np.ndarray]) -> list[FlaggedZone]:
    forehead = zones["forehead"]
    under_eye = zones["under_eye"]
    left_cheek = zones["left_cheek"]
    right_cheek = zones["right_cheek"]
    t_zone = zones["t_zone"]
    chin = zones["chin"]

    cheek_luminance = (_mean_luminance(left_cheek) + _mean_luminance(right_cheek)) / 2

    # Sebum shine: proportion of blown-out specular highlight pixels on the
    # forehead/T-zone — glossy forehead reads as oilier.
    sebum = _clamp01((_specular_ratio(forehead) + _specular_ratio(t_zone)) / 2 / 0.12)

    # Under-eye: relative darkness vs. the cheeks, plus tone unevenness.
    under_eye_darkness = _clamp01((cheek_luminance - _mean_luminance(under_eye)) / 60)
    under_eye_uneven = _clamp01(_lab_color_variance(under_eye) / 2500)
    under_eye_concern = _clamp01(under_eye_darkness * 0.7 + under_eye_uneven * 0.3)

    # Cheek texture / hydration: surface roughness (edge variance).
    cheek_variance = (_laplacian_variance(left_cheek) + _laplacian_variance(right_cheek)) / 2
    cheek_concern = _clamp01(cheek_variance / 600)

    # Cheek redness: LAB a* channel skew above neutral 128 = erythema.
    redness = _clamp01(
        ((_lab_color_variance(left_cheek) + _lab_color_variance(right_cheek)) / 2) / 2200
    )

    # Nose / T-zone pore dilation: high-frequency detail density.
    pore_concern = _clamp01(_laplacian_variance(t_zone) / 700)

    # Chin barrier: unevenness + reflective dryness.
    chin_concern = _clamp01(
        (_laplacian_variance(chin) / 800) * 0.6 + (_specular_ratio(chin) / 0.12) * 0.4
    )

    candidates = [
        (
            sebum,
            "Forehead Sebum",
            "sebum shine along the T-Zone",
        ),
        (
            under_eye_concern,
            "Under-Eye Area",
            "micro-vascular contrast & tone unevenness",
        ),
        (
            cheek_concern,
            "Cheek Texture",
            "epidermal roughness & moisture depletion",
        ),
        (
            redness,
            "Cheek Redness",
            "localized erythema on the cheeks",
        ),
        (
            pore_concern,
            "Nose Pores",
            "follicular pore dilation around the nose",
        ),
        (
            chin_concern,
            "Chin Barrier",
            "uneven barrier integrity on the chin",
        ),
    ]

    candidates.sort(key=lambda item: item[0], reverse=True)

    return [
        FlaggedZone(
            zone=zone,
            score=round(concern * 100, 1),
            description=f"{_describe(concern).capitalize()} {desc}",
            severity=_severity(concern),
        )
        for concern, zone, desc in candidates[:3]
    ]
