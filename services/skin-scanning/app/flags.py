"""Picks the zones worth pointing out on the report: up to 3 areas whose
measurements stand out, each with a stable `key` (the web app localizes the
title and advice from it), a 0-100 concern score, a plain-language
description, a severity band and where it is in the photo (on the side where
it shows most).

Like metrics.py, the concern ranges are a first-pass cosmetic heuristic, not
a clinical grading scale. Areas below MIN_CONCERN aren't reported at all, so
skin with nothing notable gets an empty list rather than three "mild" flags.
"""

import numpy as np

from app.alignment import AlignedFace
from app.metrics import REFERENCE, SkinSignals, spread
from app.schemas import FlaggedZone

MIN_CONCERN = 0.25
MAX_FLAGS = 3

# key: (zone title, what was seen — read after "Mild" / "Moderate" / "Noticeable")
_FLAG_TEXT = {
    "forehead_shine": ("Forehead shine", "shine on the forehead and nose (oily T-zone)"),
    "under_eye": ("Under-eyes", "darkness under the eyes compared with the cheeks"),
    "cheek_texture": ("Cheek texture", "unevenness in cheek texture"),
    "cheek_redness": ("Cheek redness", "redness on the cheeks"),
    "nose_pores": ("Nose pores", "pore visibility around the nose"),
}
_SIDES = ("left", "right")


def _ramp(value: float, start: float, full: float) -> float:
    """0 at `start`, 1 at `full`, clamped."""
    return max(0.0, min(1.0, (value - start) / (full - start)))


def _severity(concern: float) -> str:
    if concern >= 0.66:
        return "high"
    if concern >= 0.4:
        return "medium"
    return "low"


def _intensity(concern: float) -> str:
    return "Noticeable" if concern >= 0.66 else "Moderate" if concern >= 0.4 else "Mild"


def _center(mask: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(mask)
    return float(xs.mean()), float(ys.mean())


def compute_flagged_zones(
    face: AlignedFace,
    signals: SkinSignals,
    zones: dict[str, np.ndarray],
    raw: dict[str, float],
) -> list[FlaggedZone]:
    # key -> (concern 0-1, canonical-frame mask the marker goes on)
    found: dict[str, tuple[float, np.ndarray]] = {}
    usable = {name: mask & signals.measurable for name, mask in zones.items()}
    usable = {name: mask for name, mask in usable.items() if mask.any()}

    # Gate 5 sebum index: share of T-zone skin that is shine.
    t_zone = [zones[name] for name in ("forehead", "nose") if name in zones]
    if t_zone:
        t_zone_skin = np.logical_or.reduce(t_zone)
        shiny = signals.shine & t_zone_skin
        ratio = shiny.sum() / max(1, t_zone_skin.sum())
        found["forehead_shine"] = (_ramp(ratio, 0.02, 0.15), shiny if shiny.any() else t_zone_skin)

    # Under-eyes vs the cheek on the same side (so side lighting cancels
    # out), in percent darker. Some shading there is just face shape, hence
    # the generous starting point.
    darker = {
        side: np.median(signals.log_lum[usable[f"{side}_cheek"]])
        - np.median(signals.log_lum[usable[f"{side}_under_eye"]])
        for side in _SIDES
        if f"{side}_cheek" in usable and f"{side}_under_eye" in usable
    }
    if darker:
        worst = max(darker, key=darker.get)
        found["under_eye"] = (
            _ramp(float(np.mean(list(darker.values()))), 15, 40),
            zones[f"{worst}_under_eye"],
        )

    cheeks = {side: usable[f"{side}_cheek"] for side in _SIDES if f"{side}_cheek" in usable}
    if cheeks:
        a_star = signals.lab[..., 1]
        skin_a = np.median(a_star[signals.measurable])
        redness = {side: np.percentile(a_star[m], 90) - skin_a for side, m in cheeks.items()}
        worst = max(redness, key=redness.get)
        found["cheek_redness"] = (_ramp(float(redness[worst]), 5, 15), cheeks[worst])

        texture = {side: spread(signals.mid, m) for side, m in cheeks.items()}
        worst = max(texture, key=texture.get)
        _, good, poor = REFERENCE["texture"]
        found["cheek_texture"] = (_ramp(raw["cheek_texture"], good, poor), cheeks[worst])

    if "nose" in zones:
        _, good, poor = REFERENCE["pores"]
        found["nose_pores"] = (_ramp(raw["nose_pores"], good, poor), zones["nose"])

    ranked = sorted(
        ((concern, key, mask) for key, (concern, mask) in found.items() if concern >= MIN_CONCERN),
        key=lambda item: item[0],
        reverse=True,
    )[:MAX_FLAGS]

    flags = []
    for concern, key, mask in ranked:
        x, y = face.to_source(*_center(mask))
        flags.append(
            FlaggedZone(
                key=key,
                zone=_FLAG_TEXT[key][0],
                score=round(concern * 100, 1),
                description=f"{_intensity(concern)} {_FLAG_TEXT[key][1]}",
                severity=_severity(concern),
                x=round(x, 4),
                y=round(y, 4),
            )
        )
    return flags
