"""Derives the 5 clinical zones (forehead, under-eye, cheeks, nose/T-zone,
chin) as pixel crops of the real captured image.

Rather than hand-memorizing dozens of individual landmark indices out of the
468-point topology (an unverifiable precision claim), this uses the real
face bounding box computed from ALL detected landmarks, then crops zones as
proportions of that box — still fully driven by genuine, per-photo face
detection, just via robust geometry instead of fragile exact-index recall.
"""

import numpy as np


def _crop(image: np.ndarray, x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
    h, w = image.shape[:2]
    xi0, yi0 = max(0, int(x0)), max(0, int(y0))
    xi1, yi1 = min(w, int(x1)), min(h, int(y1))
    if xi1 <= xi0 or yi1 <= yi0:
        return image[0:1, 0:1]  # degenerate fallback, never happens for a real detected face
    return image[yi0:yi1, xi0:xi1]


def extract_zones(image: np.ndarray, landmarks: list[tuple[int, int]]) -> dict[str, np.ndarray]:
    xs = [p[0] for p in landmarks]
    ys = [p[1] for p in landmarks]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    w = x_max - x_min
    h = y_max - y_min

    forehead = _crop(image, x_min + 0.15 * w, y_min, x_max - 0.15 * w, y_min + 0.22 * h)

    under_eye = _crop(image, x_min + 0.12 * w, y_min + 0.38 * h, x_max - 0.12 * w, y_min + 0.48 * h)

    left_cheek = _crop(image, x_min + 0.05 * w, y_min + 0.48 * h, x_min + 0.35 * w, y_min + 0.68 * h)
    right_cheek = _crop(image, x_max - 0.35 * w, y_min + 0.48 * h, x_max - 0.05 * w, y_min + 0.68 * h)

    t_zone = _crop(image, x_min + 0.38 * w, y_min + 0.30 * h, x_max - 0.38 * w, y_min + 0.62 * h)

    chin = _crop(image, x_min + 0.3 * w, y_min + 0.78 * h, x_max - 0.3 * w, y_max)

    return {
        "forehead": forehead,
        "under_eye": under_eye,
        "left_cheek": left_cheek,
        "right_cheek": right_cheek,
        "t_zone": t_zone,
        "chin": chin,
    }
