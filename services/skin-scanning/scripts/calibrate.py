"""Prints v3 image measurements and eligibility reasons for a folder of photos.
This is a data inspection tool, not a clinical calibration or accuracy test.

    python scripts/calibrate.py photos/ [--overlay out/]

--overlay writes each aligned face with its skin zones outlined (shine in
white), to check the zones land on skin.
"""

import argparse
import pathlib
import sys

import cv2

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.alignment import align_face  # noqa: E402
from app.face_landmarks import detect_face  # noqa: E402
from app.metrics import measurement_report, raw_measures, skin_signals  # noqa: E402
from app.quality import check_photo_quality, measure_sharpness, PhotoQualityError  # noqa: E402
from app.zones import extract_zones  # noqa: E402

ZONE_COLORS = {
    "forehead": (0, 200, 255),
    "left_under_eye": (255, 0, 200),
    "right_under_eye": (255, 0, 200),
    "left_cheek": (0, 255, 0),
    "right_cheek": (0, 255, 0),
    "nose": (255, 128, 0),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=pathlib.Path)
    parser.add_argument("--overlay", type=pathlib.Path)
    args = parser.parse_args()

    paths = sorted(
        p for p in args.folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )
    for path in paths:
        image = cv2.imread(str(path))
        landmarks = detect_face(image) if image is not None else None
        if landmarks is None:
            print(f"{path.name}: no face")
            continue

        face = align_face(image, landmarks)
        signals = skin_signals(face)
        zones = extract_zones(face)
        raw = raw_measures(signals, zones)
        try:
            check_photo_quality(face, signals)
        except PhotoQualityError as error:
            print(f"{path.name}: rejected ({error.code})")
            continue
        report = measurement_report(face, signals, zones)

        print(f"\n{path.name}  (eye distance {face.iod_px:.0f}px, "
              f"sharpness {measure_sharpness(face, signals):.1f}, zones {sorted(zones)})")
        print("  raw    " + "  ".join(f"{k}={v:.3f}" if v is not None else f"{k}=unavailable" for k, v in raw.items()))
        for reading in report["measurements"]:
            print(f"  {reading['key']}: {reading['value']} ({reading['status']}, "
                  f"reason={reading['reason']}, pixels={reading['samplePixels']}, "
                  f"coverage={reading['coverage']})")

        if args.overlay:
            args.overlay.mkdir(parents=True, exist_ok=True)
            canvas = face.image.copy()
            for name, mask in zones.items():
                contours, _ = cv2.findContours(
                    mask.astype("uint8"), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                )
                cv2.drawContours(canvas, contours, -1, ZONE_COLORS[name], 1)
            canvas[signals.shine] = (255, 255, 255)
            cv2.imwrite(str(args.overlay / f"{path.stem}_zones.png"), canvas)


if __name__ == "__main__":
    main()
