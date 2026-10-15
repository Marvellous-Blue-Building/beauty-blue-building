from pydantic import BaseModel


class HolidayInfo(BaseModel):
    name: str
    is_civic: bool
    is_religious: bool
    is_cuti_bersama: bool
    kb_match: str | None = None


class WeatherInfo(BaseModel):
    condition: str
    temperature: float
    humidity: float
    wind_speed: float
    wind_direction: str
    observed_at: str
    kb_match: str | None = None


class ContextResponse(BaseModel):
    timestamp: str
    # Null when the user denied/revoked location permission — see
    # app/formula.py's no-location fallback.
    latitude: float | None = None
    longitude: float | None = None
    is_holiday: bool
    holiday: HolidayInfo | None = None
    weather: WeatherInfo | None = None
    guidance_text: str
    boost_keywords: list[str]
