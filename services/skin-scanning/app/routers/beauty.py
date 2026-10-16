"""Beauty scan endpoint: one scan in three poses -> colour season, face shape
and skin type together (see app/beauty/scan.py). `language: "en"` returns the
text in English (app/beauty/english.py); the default is Indonesian.

Errors the app can act on are 422s with `{"detail": {"code", "message"}}`:
`no_face`, `face_too_small`, `no_skin`, `too_dark`, `too_blurry`.
"""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.beauty.english import to_english
from app.beauty.scan import MAX_FRAMES, MAX_SIDE_FRAMES, BeautyScanError
from app.beauty.scan import analyse as analyse_beauty
from app.quality import PhotoQualityError
from app.routers.scan import _decode_image, _unprocessable

router = APIRouter()


class BeautyScanRequest(BaseModel):
    frames: list[str] = Field(
        min_length=1, max_length=MAX_FRAMES, description="Front burst: base64 JPEG/PNG frames, not mirrored"
    )
    right: list[str] = Field(default=[], max_length=MAX_SIDE_FRAMES, description="Turned to the user's own right")
    left: list[str] = Field(default=[], max_length=MAX_SIDE_FRAMES, description="Turned to the user's own left")
    language: Literal["id", "en"] = "id"


@router.post("/analyze-beauty")
async def analyze_beauty(body: BeautyScanRequest) -> dict:
    images = [_decode_image(frame) for frame in body.frames]
    sides = {pose: [_decode_image(f) for f in frames] for pose, frames in (("right", body.right), ("left", body.left)) if frames}
    try:
        result = analyse_beauty(images, sides)
    except (BeautyScanError, PhotoQualityError) as error:
        raise _unprocessable(error.code, error.message) from error
    return to_english(result) if body.language == "en" else result
