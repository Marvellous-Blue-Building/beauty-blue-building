"""Skin-tone / undertone endpoint — reuses the same face detection and
alignment pipeline as app/routers/scan.py, just a different reading off the
aligned face. See app/color.py for the extraction math.
"""

from fastapi import APIRouter, HTTPException

from app.alignment import align_face
from app.color import analyze_skin_color
from app.face_landmarks import detect_face
from app.routers.scan import _decode_image, _unprocessable
from app.schemas import ColorAnalyzeRequest, ColorAnalyzeResponse

router = APIRouter()


@router.post("/analyze-color", response_model=ColorAnalyzeResponse)
async def analyze_color(body: ColorAnalyzeRequest) -> ColorAnalyzeResponse:
    image = _decode_image(body.imageBase64)

    landmarks = detect_face(image)
    if landmarks is None:
        raise _unprocessable("no_face", "No face detected in the captured image.")

    face = align_face(image, landmarks)
    if not face.skin.any():
        raise _unprocessable("no_skin", "Not enough visible skin to read a color from.")

    color = analyze_skin_color(face)
    return ColorAnalyzeResponse(
        skinToneHex=color.hex,
        labL=color.l,
        labA=color.a,
        labB=color.b,
        itaAngle=color.ita,
        undertone=color.undertone,
        depthCategory=color.depth,
    )
