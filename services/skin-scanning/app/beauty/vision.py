"""The two MediaPipe models the beauty scan runs on every frame:

- FaceLandmarker with blendshapes: the 478-point mesh every reading is placed
  from, and the expression scores the face-shape scan refuses smiles with.
- The multiclass selfie segmenter (selfie_multiclass_256x256): which pixels are
  hair, skin or clothes, so the colour analysis reads hair (not a hijab or the
  ceiling) as its white-balance reference and knows when the head is covered.

Both are loaded once at import. Without the segmenter model the scan still
runs, judging hair by colour alone.
"""

import pathlib
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

_MODELS = pathlib.Path(__file__).resolve().parents[2] / "models"
LANDMARKER_PATH = _MODELS / "face_landmarker.task"
SEGMENTER_PATH = _MODELS / "selfie_multiclass_256x256.tflite"

# selfie_multiclass_256x256 categories.
BACKGROUND, HAIR, BODY_SKIN, FACE_SKIN, CLOTHES, OTHER = range(6)

_landmarker = vision.FaceLandmarker.create_from_options(
    vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(LANDMARKER_PATH)),
        running_mode=vision.RunningMode.IMAGE,
        num_faces=1,
        output_face_blendshapes=True,
    )
)

_segmenter = None
if SEGMENTER_PATH.exists():
    _segmenter = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(SEGMENTER_PATH)),
            running_mode=vision.RunningMode.IMAGE,
            output_category_mask=True,
            output_confidence_masks=False,
        )
    )


@dataclass
class FaceFrame:
    rgb: np.ndarray  # H x W x 3 uint8, not mirrored
    landmarks: np.ndarray  # (478, 3): x, y as frame fractions, z in frame widths
    blendshapes: dict[str, float]
    categories: np.ndarray | None  # segmenter labels (any resolution), or None

    @property
    def width(self) -> int:
        return self.rgb.shape[1]

    @property
    def height(self) -> int:
        return self.rgb.shape[0]

    def category_at(self, x_px: float, y_px: float) -> int:
        """Segmenter label under a frame pixel, -1 when there is no mask."""
        if self.categories is None:
            return -1
        mh, mw = self.categories.shape[:2]
        mx, my = int(x_px / self.width * mw), int(y_px / self.height * mh)
        if not (0 <= mx < mw and 0 <= my < mh):
            return -1
        return int(self.categories[my, mx])


def analyse_frame(bgr: np.ndarray) -> FaceFrame | None:
    """Landmarks, blendshapes and segmentation for one frame; None without a face."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = _landmarker.detect(image)
    if not result.face_landmarks:
        return None

    landmarks = np.array([[p.x, p.y, p.z] for p in result.face_landmarks[0]], dtype=np.float64)
    blendshapes = (
        {c.category_name: float(c.score) for c in result.face_blendshapes[0]}
        if result.face_blendshapes
        else {}
    )
    categories = None
    if _segmenter is not None:
        segmented = _segmenter.segment(image)
        if segmented.category_mask is not None:
            categories = np.squeeze(segmented.category_mask.numpy_view()).copy()  # (H, W[, 1]) -> (H, W)
    return FaceFrame(rgb=rgb, landmarks=landmarks, blendshapes=blendshapes, categories=categories)


def segmenter_available() -> bool:
    return _segmenter is not None
