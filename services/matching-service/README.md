# matching-service

FastAPI service that computes the questionnaire + skin-scan → routine match
against the real `products` table (the same Postgres DB the Next.js app
uses). Faithful port of the logic that used to live in
`apps/web/lib/rag/match-routine.ts` — same SQL, same keyword dictionaries,
same progressive constraint relaxation, same honesty about what's deferred
(no embeddings/pgvector, no real LLM call).

## Run locally

```
cd services/matching-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit DATABASE_URL if needed
uvicorn app.main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

The Next.js app (`apps/web`) calls this service via `MATCHING_SERVICE_URL`
(see `apps/web/.env.local`) — start this service before using the
onboarding quiz / skin scan flow.

## Endpoint

`POST /match-routine`

```json
{
  "quiz": { "skinType": "Oily", "concerns": ["Acne & Breakouts"], "sensitivities": ["None of these"], "climate": null, "budget": 300000, "ethics": {"vegan": false, "crueltyFree": false, "fragranceFree": false}, "goal": "Clear Skin" },
  "scan": null
}
```

Returns `{ "am": MatchedRoutineStep[], "pm": MatchedRoutineStep[] }`.
