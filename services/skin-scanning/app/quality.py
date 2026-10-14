"""Server-side photo quality checks (the v1.1 spec's post-capture gates). The
camera screen already checks light, sharpness and pose live, but uploaded
photos skip that — and a dark, blurry or tiny face would produce scores that
describe the photo rather than the skin. A failed check is reported as a 422
with a machine-readable `code` the app turns into specific advice.
"""

import cv2
import numpy as np

from app.alignment import IOD, LEFT_EYE, RIGHT_EYE, AlignedFace
from app.metrics import SkinSignals

MIN_IOD_PX = 48  # eye-center distance in the photo; smaller = face too small
MIN_SKIN_LUMA = 45  # median skin brightness (0-255)
# Sharp captures measured ~80-130 in calibration and a visibly blurred one
# ~33; set low so only clearly blurred photos are turned away.
MIN_EDGE_SHARPNESS = 50.0


class PhotoQualityError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def measure_sharpness(face: AlignedFace, signals: SkinSignals) -> float:
    """Edge strength around the eyes (lashes, lids, iris rim) — the crispest
    detail on any face, so it drops sharply when the photo is out of focus or
    motion-blurred. Measured on log-luminance, so it doesn't depend on
    brightness or skin tone."""
    region = np.zeros(face.skin.shape, np.uint8)
    for group in (LEFT_EYE, RIGHT_EYE):
        hull = cv2.convexHull(np.round(face.landmarks[group]).astype(np.int32))
        cv2.fillConvexPoly(region, hull, 255)
    region = cv2.dilate(region, np.ones((round(0.1 * IOD),) * 2, np.uint8)) > 0
    laplacian = cv2.Laplacian(signals.log_lum, cv2.CV_32F, ksize=3)
    return float(np.percentile(np.abs(laplacian[region]), 95)) if region.any() else 0.0


def check_photo_quality(face: AlignedFace, signals: SkinSignals) -> None:
    if face.iod_px < MIN_IOD_PX:
        raise PhotoQualityError(
            "face_too_small", "The face is too small in the photo. Move closer or use a sharper photo."
        )
    if not face.skin.any():
        raise PhotoQualityError("no_skin", "Couldn't see enough skin. Remove anything covering the face.")

    luma = cv2.cvtColor(face.image, cv2.COLOR_BGR2GRAY)
    if np.median(luma[face.skin]) < MIN_SKIN_LUMA:
        raise PhotoQualityError("too_dark", "The photo is too dark. Move to brighter, even light.")

    if measure_sharpness(face, signals) < MIN_EDGE_SHARPNESS:
        raise PhotoQualityError("too_blurry", "The photo is blurry. Hold still and try again.")
