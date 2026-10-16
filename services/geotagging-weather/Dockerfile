FROM python:3.12-slim

# app/kb_loader.py computes REPO_ROOT = Path(__file__).resolve().parents[3],
# assuming it lives 3 directories under the monorepo root (as it does in
# the native checkout: services/geotagging-weather/app/kb_loader.py). That
# expression runs unconditionally (even when KB_HOLIDAY_PATH/KB_WEATHER_PATH
# below override the result), so it must not raise — mirroring the same
# relative depth here keeps it valid without touching the Python source.
WORKDIR /build/services/geotagging-weather

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --system --uid 1001 appuser && chown -R appuser /build
USER appuser

# kb_holiday.md / kb_weather.md are not git-tracked (see docs/installation.md
# §6c) — app/kb_loader.py reads them from these paths, meant to be
# bind-mounted in by docker-compose.yml from wherever the host keeps them.
# If absent, weather-dependent endpoints 500, matching today's behavior.
ENV KB_HOLIDAY_PATH=/kb/kb_holiday.md
ENV KB_WEATHER_PATH=/kb/kb_weather.md

ENV PORT=8010
EXPOSE 8010
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
