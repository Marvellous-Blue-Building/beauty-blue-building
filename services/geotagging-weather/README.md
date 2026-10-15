# geotagging-weather

Combines Indonesia's national holiday calendar and live weather into a
single "environmental context" — a plain-language guidance string plus a
flat product-keyword boost list — consumed by `matching-service` to make
chat recommendations and skin-diagnosis product matching aware of what day
it is and what the weather's actually doing where the user is.

## The formula

Given a `(latitude, longitude)`:

1. Look up today's date in the `indonesia_holiday` table (populated by
   `apps/web`'s `lib/indonesia-holiday.ts` on every register/login/relogin
   from `https://api.kemendesa.link/libur-nasional/api/holidays/<year>.json`).
2. Call the weather API
   (`https://weather.ewalabs.com/api/v1?lat=<lat>&lon=<lon>`) for current
   conditions.
3. **If today is a holiday:** combine `kb_holiday.md`'s matching entry +
   the holiday API's own fields + `kb_weather.md`'s matching entry + the
   weather API's own fields.
4. **If today is not a holiday:** combine `kb_weather.md`'s matching entry
   + the weather API's own fields only.

`kb_holiday.md` and `kb_weather.md` (repo root) are parsed at runtime
(`app/kb_loader.py`) — editing their wording or adding a holiday entry
needs no code change. Matching an API holiday name or weather condition to
the closest KB entry is a small curated heuristic (`app/holiday_matcher.py`,
`app/weather_classifier.py`), since neither external API's vocabulary maps
1:1 onto the KB's categories.

## Running

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in DATABASE_URL
uvicorn app.main:app --reload --port 8010
```

## Endpoint

`GET /context?lat=<float>&lon=<float>` → `ContextResponse` (see
`app/schemas.py`): timestamp, holiday/weather details, `guidance_text`
(free text for LLM reasoning), `boost_keywords` (for keyword-based product
scoring).
