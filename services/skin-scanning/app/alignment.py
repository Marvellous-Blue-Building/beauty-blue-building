"""Aligns the detected face to one canonical frame so every measurement is
taken at the same scale and orientation, whatever the camera resolution,
distance or head tilt.

The face is rotated so the eyes are level and scaled so the distance between
the eye centers is `IOD` pixels (downscaling with area averaging, which also
evens out sensor noise between cameras). Landmark groups come from MediaPipe's
own named connection sets (eyes, brows, nose, lips, face oval) rather than
hand-picked landmark indices.

The skin mask keeps only skin: it starts from the face oval, cuts out the
eyes, brows and lips, then drops pixels whose color is far from the face's
own median skin color (hair, beard, nostrils, deep shadows). Bright, nearly
white pixels are kept on purpose — shine is skin, and is measured separately.
"""

from dataclasses import dataclass

import cv2
import numpy as np
from mediapipe.tasks.python.vision import FaceLandmarksConnections as _Connections


def _group(connections) -> list[int]:
    return sorted({index for c in connections for index in (c.start, c.end)})


LEFT_EYE = _group(_Connections.FACE_LANDMARKS_LEFT_EYE)
RIGHT_EYE = _group(_Connections.FACE_LANDMARKS_RIGHT_EYE)
LEFT_BROW = _group(_Connections.FACE_LANDMARKS_LEFT_EYEBROW)
RIGHT_BROW = _group(_Connections.FACE_LANDMARKS_RIGHT_EYEBROW)
NOSE = _group(_Connections.FACE_LANDMARKS_NOSE)
LIPS = _group(_Connections.FACE_LANDMARKS_LIPS)
FACE_OVAL = _group(_Connections.FACE_LANDMARKS_FACE_OVAL)

IOD = 128  # canonical distance between the eye centers, in pixels
EYE_Y = 166  # canonical height of the eye line
CANVAS_W, CANVAS_H = 3 * IOD, 460  # eyes sit at x = IOD and x = 2 * IOD

# Padding (in IOD units) cut around features so lashes, brow hairs and lip
# edges don't leak into the skin zones.
_FEATURE_PADDING = (
    (LEFT_EYE, 0.12),
    (RIGHT_EYE, 0.12),
    (LEFT_BROW, 0.06),
    (RIGHT_BROW, 0.06),
    (LIPS, 0.06),
)
_MAX_CHROMA_DISTANCE = 18.0  # a*b* distance from the median skin color
_MAX_DARKER_L = 22.0  # how much darker (L*) than median skin a pixel may be
_SHINE_MIN_L = 85.0  # L* above this with low chroma is a highlight on skin
_SHINE_MAX_CHROMA = 12.0


@dataclass
class AlignedFace:
    image: np.ndarray  # canonical BGR uint8, CANVAS_H x CANVAS_W
    landmarks: np.ndarray  # landmark (x, y) in canonical coordinates
    skin: np.ndarray  # bool mask of skin pixels
    iod_px: float  # eye-center distance in the original photo, in pixels
    to_canonical: np.ndarray  # 2x3 affine: original photo pixels -> canonical
    source_size: tuple[int, int]  # original photo (width, height)

    def to_source(self, x: float, y: float) -> tuple[float, float]:
        """A canonical point as a 0-1 position in the original photo."""
        back = cv2.invertAffineTransform(self.to_canonical) @ np.array([x, y, 1.0])
        width, height = self.source_size
        return float(back[0] / width), float(back[1] / height)


def _eye_centers(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Eye centers ordered image-left first."""
    a = points[RIGHT_EYE].mean(axis=0)
    b = points[LEFT_EYE].mean(axis=0)
    return (a, b) if a[0] <= b[0] else (b, a)


def align_face(image: np.ndarray, landmarks: list[tuple[int, int]]) -> AlignedFace:
    points = np.asarray(landmarks, dtype=np.float64)
    left, right = _eye_centers(points)
    iod_px = float(np.hypot(*(right - left)))
    source_h, source_w = image.shape[:2]

    pre_scale = np.array([1.0, 1.0])
    scale = IOD / iod_px
    if scale < 1:
        new_w, new_h = max(1, round(source_w * scale)), max(1, round(source_h * scale))
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        pre_scale = np.array([new_w / source_w, new_h / source_h])
        points = points * pre_scale
        left, right = _eye_centers(points)
        scale = IOD / float(np.hypot(*(right - left)))

    angle = np.degrees(np.arctan2(right[1] - left[1], right[0] - left[0]))
    matrix = cv2.getRotationMatrix2D((float(left[0]), float(left[1])), angle, scale)
    matrix[:, 2] += np.array([IOD, EYE_Y]) - matrix @ np.array([left[0], left[1], 1.0])

    canonical = cv2.warpAffine(
        image, matrix, (CANVAS_W, CANVAS_H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0)
    )
    in_frame = (
        cv2.warpAffine(
            np.full(image.shape[:2], 255, np.uint8), matrix, (CANVAS_W, CANVAS_H)
        )
        > 127
    )
    canonical_points = np.hstack([points, np.ones((len(points), 1))]) @ matrix.T

    return AlignedFace(
        image=canonical,
        landmarks=canonical_points,
        skin=_skin_mask(canonical, canonical_points, in_frame),
        iod_px=iod_px,
        to_canonical=matrix * np.array([pre_scale[0], pre_scale[1], 1.0]),
        source_size=(source_w, source_h),
    )


def _hull(points: np.ndarray) -> np.ndarray:
    return cv2.convexHull(np.round(points).astype(np.int32))


def _skin_mask(image: np.ndarray, points: np.ndarray, in_frame: np.ndarray) -> np.ndarray:
    face = np.zeros(image.shape[:2], np.uint8)
    cv2.fillConvexPoly(face, _hull(points[FACE_OVAL]), 255)
    for group, padding in _FEATURE_PADDING:
        hull = _hull(points[group])
        cv2.fillConvexPoly(face, hull, 0)
        cv2.polylines(face, [hull], True, 0, thickness=max(1, round(2 * padding * IOD)))
    face_mask = (face > 0) & in_frame
    if not face_mask.any():
        return face_mask

    lab = cv2.cvtColor(image.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)
    median = np.median(lab[face_mask], axis=0)
    chroma_distance = np.hypot(lab[..., 1] - median[1], lab[..., 2] - median[2])
    skin_colored = (chroma_distance < _MAX_CHROMA_DISTANCE) & (
        lab[..., 0] > median[0] - _MAX_DARKER_L
    )
    highlight = (lab[..., 0] > _SHINE_MIN_L) & (np.hypot(lab[..., 1], lab[..., 2]) < _SHINE_MAX_CHROMA)
    return face_mask & (skin_colored | highlight)
