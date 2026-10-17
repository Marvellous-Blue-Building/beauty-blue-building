"""One-time fetch of Google's official MediaPipe models into models/ — binary
model weights aren't hand-authored or committed to source, just downloaded
once per machine. Safe to re-run (skips what is already present).

- face_landmarker.task: the 478-point face mesh every scan uses.
- selfie_multiclass_256x256.tflite: hair / skin / clothes segmentation for
  the beauty scan's colour analysis (/analyze-beauty). Optional — without it
  the colour analysis judges hair by colour alone.
"""

import pathlib
import sys
import urllib.request

MODELS = {
    "face_landmarker.task": (
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/latest/face_landmarker.task"
    ),
    "selfie_multiclass_256x256.tflite": (
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
        "selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
    ),
}

MODELS_DIR = pathlib.Path(__file__).resolve().parent.parent / "models"


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in MODELS.items():
        path = MODELS_DIR / name
        if path.exists() and path.stat().st_size > 0:
            print(f"Already present: {path} ({path.stat().st_size} bytes)")
            continue

        print(f"Downloading {url} ...")
        urllib.request.urlretrieve(url, path)
        size = path.stat().st_size
        if size < 100_000:
            print(f"Downloaded file looks too small ({size} bytes) — something went wrong.", file=sys.stderr)
            sys.exit(1)
        print(f"Saved {path} ({size} bytes)")


if __name__ == "__main__":
    main()
