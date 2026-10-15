"""Classifies a weather API reading (condition text + temperature/humidity/
wind) into the closest kb_weather.md entry. The weather API's `weather`
field uses standard Indonesian forecast vocabulary (Cerah, Berawan, Hujan,
Kabut, Berangin, ...) that doesn't map 1:1 onto the KB's 6 broader
categories, and the KB itself leans on temperature/humidity/wind too (e.g.
distinguishing "Hot & Humid" from "Sunny & Clear" isn't just about the
condition text) — so this is a small ordered heuristic, not a lookup
table.
"""

from app.kb_loader import KbEntry, load_weather_kb

RAINY_KEYWORDS = ["hujan"]
DUSTY_KEYWORDS = ["kabut", "asap", "debu", "berdebu", "udara kabur"]
CLEAR_KEYWORDS = ["cerah"]
CLOUDY_KEYWORDS = ["berawan", "mendung"]

COLD_TEMP_C = 22  # Indonesia rarely sees literal cold outside highlands — this is a conservative threshold
HOT_TEMP_C = 28
HUMID_PCT = 70
WINDY_KMH = 15


def _kb(title: str) -> KbEntry | None:
    by_title = {entry.title: entry for entry in load_weather_kb()}
    return by_title.get(title)


def classify_weather(condition: str, temperature: float, humidity: float, wind_speed: float) -> KbEntry | None:
    text = condition.lower()
    is_windy = wind_speed >= WINDY_KMH

    if any(k in text for k in RAINY_KEYWORDS):
        return _kb("Hujan (Rainy / Wet)")

    if any(k in text for k in DUSTY_KEYWORDS) or (is_windy and temperature >= HOT_TEMP_C and humidity < HUMID_PCT):
        return _kb("Berangin Kering / Berdebu (Dry & Dusty / Windy)")

    if temperature <= COLD_TEMP_C and is_windy:
        return _kb("Dingin & Berangin (Cold & Windy)")

    if temperature >= HOT_TEMP_C and humidity >= HUMID_PCT:
        return _kb("Panas & Lembab (Hot & Humid)")

    if any(k in text for k in CLEAR_KEYWORDS) and humidity < HUMID_PCT:
        return _kb("Cerah & Terik (Sunny & Clear)")

    if any(k in text for k in CLOUDY_KEYWORDS) or any(k in text for k in CLEAR_KEYWORDS):
        return _kb("Berawan / Mendung (Cloudy / Overcast)")

    # Unrecognized condition text — Cloudy/Overcast is the safest generic
    # default (moderate guidance, not an extreme-weather alarm).
    return _kb("Berawan / Mendung (Cloudy / Overcast)")
