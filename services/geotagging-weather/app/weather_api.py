"""Calls the real weather API directly, by lat/long — mirrors
apps/web/lib/weather-client.ts's logic (same API, same "closest forecast
slot to now" pick) so this service can also answer /context calls that
don't already have a fresher cached reading upstream.
"""

from datetime import datetime, timedelta, timezone

import httpx

WEATHER_API_URL = "https://weather.ewalabs.com/api/v1"

# The API's local_datetime strings have no timezone suffix, but they're
# wall-clock time in Indonesia (WIB, UTC+7, no DST) — not whatever timezone
# this process happens to run in. `datetime.strptime` without a tzinfo
# produces a naive datetime, and `.timestamp()` on that silently assumes the
# SYSTEM's local timezone — comparing it against a real UTC "now" would be
# off by a full timezone gap on any host not already set to WIB, which at
# the API's own 3-hour forecast granularity is enough to pick the wrong slot.
JAKARTA_TZ = timezone(timedelta(hours=7))


def _closest_to_now(forecast: list[dict]) -> dict:
    now = datetime.now(timezone.utc)

    def distance(entry: dict) -> float:
        dt = datetime.strptime(entry["local_datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=JAKARTA_TZ)
        return abs((dt - now).total_seconds())

    return min(forecast, key=distance)


async def fetch_current_weather(latitude: float, longitude: float) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(WEATHER_API_URL, params={"lat": latitude, "lon": longitude})
        if response.status_code != 200:
            return None
        body = response.json()
        forecast = (body.get("data") or {}).get("forecast") or []
        if body.get("status") != "success" or not forecast:
            return None

        entry = _closest_to_now(forecast)
        return {
            "condition": entry["weather"],
            "temperature": entry["temperature"],
            "humidity": entry["humidity"],
            "wind_speed": entry["wind_speed"],
            "wind_direction": entry["wind_direction"],
            "observed_at": entry["local_datetime"],
        }
    except (httpx.HTTPError, KeyError, ValueError):
        return None
