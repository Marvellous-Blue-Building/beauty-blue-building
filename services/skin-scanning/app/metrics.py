"""Real pixel-level metric computation per zone. Each measurement (mean
luminance, specular-highlight ratio, Laplacian edge/texture variance, LAB
color-space uniformity) is genuinely derived from the captured photo's
pixels. The constants that scale a raw measurement into a 0-100 score are a
reasonable heuristic calibration — not a clinically validated dermatology
model — same honesty standard as this project's RAG product-matching
pipeline (see services/matching-service's docstring)."""

import cv2
import numpy as np


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _mean_luminance(bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def _specular_ratio(bgr: np.ndarray, threshold: int = 200) -> float:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray > threshold))


def _laplacian_variance(bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _lab_color_variance(bgr: np.ndarray) -> float:
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    a_var = float(np.var(lab[:, :, 1]))
    b_var = float(np.var(lab[:, :, 2]))
    return a_var + b_var


def compute_metrics(zones: dict[str, np.ndarray]) -> dict[str, float]:
    forehead = zones["forehead"]
    under_eye = zones["under_eye"]
    left_cheek = zones["left_cheek"]
    right_cheek = zones["right_cheek"]
    t_zone = zones["t_zone"]

    # Hydration: brighter, glossier skin (higher luminance + more specular
    # highlight pixels) in forehead + cheeks reads as more hydrated/radiant.
    luminance = (
        _mean_luminance(forehead) + _mean_luminance(left_cheek) + _mean_luminance(right_cheek)
    ) / 3
    specular = (
        _specular_ratio(forehead) + _specular_ratio(left_cheek) + _specular_ratio(right_cheek)
    ) / 3
    hydration = _clamp(40 + luminance * 0.22 + specular * 120)

    # Elasticity: fine-line/edge density in forehead + under-eye, inverted —
    # more visible edges there reads as less elastic skin.
    edge_density = (_laplacian_variance(forehead) + _laplacian_variance(under_eye)) / 2
    elasticity = _clamp(95 - edge_density * 0.08)

    # Pigmentation: color (LAB a*/b*) variance across both cheeks, inverted —
    # more uneven tone / dark-spot clustering reads as lower score.
    color_variance = (_lab_color_variance(left_cheek) + _lab_color_variance(right_cheek)) / 2
    pigmentation = _clamp(95 - color_variance * 0.015)

    # Texture: local roughness (Laplacian variance) across both cheeks,
    # inverted — rougher surface detail reads as lower score.
    texture_variance = (_laplacian_variance(left_cheek) + _laplacian_variance(right_cheek)) / 2
    texture = _clamp(95 - texture_variance * 0.07)

    # Pores: high-frequency detail specifically in the nose/T-zone, inverted.
    pore_variance = _laplacian_variance(t_zone)
    pores = _clamp(95 - pore_variance * 0.09)

    overall = (hydration + elasticity + pigmentation + texture + pores) / 5

    return {
        "hydration": round(hydration, 1),
        "elasticity": round(elasticity, 1),
        "pigmentation": round(pigmentation, 1),
        "texture": round(texture, 1),
        "pores": round(pores, 1),
        "overall": round(overall, 1),
    }
