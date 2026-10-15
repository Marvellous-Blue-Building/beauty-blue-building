"""The combine "formula":
  - If today is found in the Indonesia holiday calendar: KB holiday entry
    + the holiday API's own data + KB weather entry + the weather API's
    own data.
  - If today is not a holiday: KB weather entry + the weather API's own
    data only.
  - If the user denied/revoked location permission (no lat/long at all):
    weather is skipped entirely — combine only the current date/time +
    the Indonesia holiday API + KB holiday (whether or not today actually
    is a holiday; there's simply nothing weather-related to say).

Produces both a human-readable `guidance_text` (fed to the chat LLM as
extra reasoning context) and a flat `boost_keywords` list (fed into
matching-service's keyword-based product scoring) — see
services/matching-service/app/routers/match_routine.py and
app/chat_pipeline.py for the two consumers.
"""

from datetime import date, datetime

from app.holiday_matcher import match_holiday_kb
from app.holiday_repository import get_holiday_for_date
from app.kb_loader import KbEntry
from app.weather_api import fetch_current_weather
from app.weather_classifier import classify_weather


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _kb_guidance_text(entry: KbEntry) -> str:
    parts = []
    if entry.concerns:
        parts.append("skin concerns: " + "; ".join(entry.concerns))
    if entry.product_needs:
        needs = "; ".join(f"{n.label} — {n.detail}" for n in entry.product_needs)
        parts.append("targeted product needs: " + needs)
    return "; ".join(parts)


async def build_context(latitude: float | None, longitude: float | None, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    today: date = now.date()
    has_location = latitude is not None and longitude is not None

    weather_reading = await fetch_current_weather(latitude, longitude) if has_location else None
    weather_kb = (
        classify_weather(
            weather_reading["condition"],
            weather_reading["temperature"],
            weather_reading["humidity"],
            weather_reading["wind_speed"],
        )
        if weather_reading
        else None
    )

    holiday_row = await get_holiday_for_date(today)
    holiday_kb = match_holiday_kb(holiday_row["name"]) if holiday_row else None

    guidance_lines: list[str] = []
    boost_keywords: list[str] = []

    if holiday_row:
        guidance_lines.append(f"Today ({today.isoformat()}) is an Indonesian public holiday: {holiday_row['name']}.")
        if holiday_kb:
            guidance_lines.append(f"Holiday context ({holiday_kb.title}): {_kb_guidance_text(holiday_kb)}.")
            boost_keywords += holiday_kb.boost_keywords
    elif not has_location:
        # With location, "not a holiday" is implicit (the weather lines
        # below say everything) — but without it, there'd be nothing at all
        # to say, so the non-holiday state itself needs to be stated.
        guidance_lines.append(f"Today ({today.isoformat()}) is not an Indonesian public holiday.")

    if has_location:
        if weather_reading:
            guidance_lines.append(
                "Current weather: "
                f"{weather_reading['condition']}, {weather_reading['temperature']}°C, "
                f"{weather_reading['humidity']}% humidity, wind {weather_reading['wind_speed']} km/h."
            )
            if weather_kb:
                guidance_lines.append(f"Weather context ({weather_kb.title}): {_kb_guidance_text(weather_kb)}.")
                boost_keywords += weather_kb.boost_keywords
        else:
            guidance_lines.append("Current weather is unavailable right now.")
    # else: location permission was denied/revoked — weather is skipped
    # entirely rather than noted as "unavailable", per the no-location
    # formula (date/time + holiday API + KB holiday only).

    return {
        "timestamp": now.strftime("%d-%m-%Y %H:%M:%S"),
        "latitude": latitude,
        "longitude": longitude,
        "is_holiday": holiday_row is not None,
        "holiday": (
            {
                "name": holiday_row["name"],
                "is_civic": holiday_row["is_civic"],
                "is_religious": holiday_row["is_religious"],
                "is_cuti_bersama": holiday_row["is_cuti_bersama"],
                "kb_match": holiday_kb.title if holiday_kb else None,
            }
            if holiday_row
            else None
        ),
        "weather": (
            {
                "condition": weather_reading["condition"],
                "temperature": weather_reading["temperature"],
                "humidity": weather_reading["humidity"],
                "wind_speed": weather_reading["wind_speed"],
                "wind_direction": weather_reading["wind_direction"],
                "observed_at": weather_reading["observed_at"],
                "kb_match": weather_kb.title if weather_kb else None,
            }
            if weather_reading
            else None
        ),
        "guidance_text": " ".join(guidance_lines),
        "boost_keywords": _dedupe(boost_keywords),
    }
