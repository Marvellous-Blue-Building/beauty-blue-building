"""Real face landmark detection via MediaPipe's FaceLandmarker (Tasks API —
the new one; `mp.solutions.face_mesh` is deprecated and not used here).
Loaded once at import time so each /analyze request reuses the same model."""

import pathlib

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

MODEL_PATH = pathlib.Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task"

if not MODEL_PATH.exists():
    raise RuntimeError(
        f"Model file not found at {MODEL_PATH} — run `python scripts/download_model.py` first."
    )

_options = vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
    running_mode=vision.RunningMode.IMAGE,
    num_faces=1,
)
_landmarker = vision.FaceLandmarker.create_from_options(_options)


def detect_face(bgr_image: np.ndarray) -> list[tuple[int, int]] | None:
    """Returns the 468 face landmarks in pixel coordinates (x, y), or None
    if no face was found in the image."""
    rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
    result = _landmarker.detect(mp_image)

    if not result.face_landmarks:
        return None

    height, width = bgr_image.shape[:2]
    landmarks = result.face_landmarks[0]
    return [(int(lm.x * width), int(lm.y * height)) for lm in landmarks]
