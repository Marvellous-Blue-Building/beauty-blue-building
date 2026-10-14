"""One-time fetch of Google's official MediaPipe FaceLandmarker model bundle
into models/ — binary model weights aren't hand-authored or committed to
source, just downloaded once per machine. Safe to re-run (skips if present)."""

import pathlib
import sys
import urllib.request

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/latest/face_landmarker.task"
)

MODELS_DIR = pathlib.Path(__file__).resolve().parent.parent / "models"
MODEL_PATH = MODELS_DIR / "face_landmarker.task"


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if MODEL_PATH.exists() and MODEL_PATH.stat().st_size > 0:
        print(f"Already present: {MODEL_PATH} ({MODEL_PATH.stat().st_size} bytes)")
        return

    print(f"Downloading {MODEL_URL} ...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    size = MODEL_PATH.stat().st_size
    if size < 100_000:
        print(f"Downloaded file looks too small ({size} bytes) — something went wrong.", file=sys.stderr)
        sys.exit(1)
    print(f"Saved {MODEL_PATH} ({size} bytes)")


if __name__ == "__main__":
    main()
