from fastapi import APIRouter, Query

from app.formula import build_context
from app.schemas import ContextResponse

router = APIRouter()


@router.get("/context", response_model=ContextResponse)
async def get_context(
    lat: float | None = Query(None, description="Latitude — omit if location permission was denied/revoked"),
    lon: float | None = Query(None, description="Longitude — omit if location permission was denied/revoked"),
) -> ContextResponse:
    context = await build_context(lat, lon)
    return ContextResponse(**context)
