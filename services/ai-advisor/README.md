# ai-advisor

FastAPI service that answers chat messages the deterministic rule set and
dictionary/keyword matching (`apps/web/lib/chat/bot-reply.ts`,
`apps/web/lib/rag/`) can't resolve — i.e. genuinely ambiguous or open-ended
questions the "as-is" matching has no rule or keyword for.

Uses Google's **Gemini** via the `google-genai` SDK — a real LLM call, not a
scripted/templated reply. Keep expectations honest: it's a general-purpose
model, not clinically validated dermatological advice. The system prompt
tells it to recommend a dermatologist for anything that sounds medical
rather than freelancing a diagnosis. It's instructed to always reply in
Bahasa Indonesia regardless of what language the question is asked in —
there's no `locale` field on the request.

## Setup

No model weights to download — `app/gemini.py` picks one of two auth modes
automatically:

- **Vertex AI** (used in the Cloud Run deployment): set `GOOGLE_CLOUD_PROJECT`
  and run `gcloud auth application-default login` once locally to mint
  credentials; on Cloud Run itself, the service account's own identity is
  used instead (grant it the `roles/aiplatform.user` IAM role), no key to
  manage.
- **Gemini Developer API** (simpler for local dev without a GCP project set
  up): get a free key at https://aistudio.google.com/apikey and set
  `GEMINI_API_KEY`. Used only when `GOOGLE_CLOUD_PROJECT` is unset.

```bash
cd services/ai-advisor
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in one of the two auth modes above
uvicorn app.main:app --reload --port 3004
```

Swagger UI: http://localhost:3004/docs

The Next.js app (`apps/web`) calls this service via `AI_ADVISOR_SERVICE_URL`
(see `apps/web/.env.local`) from `apps/web/lib/chat/bot-reply.ts`, only when
no deterministic rule matches the user's message.

## Endpoint

`POST /advise`

```json
{ "message": "is bakuchiol a good retinol alternative for sensitive skin?" }
```

Returns:

```json
{ "reply": "Bakuchiol is a solid retinol alternative for sensitive skin — it offers similar anti-aging benefits with much less irritation. Start a few times a week and pair with a good moisturizer." }
```

Returns `503` with a `detail` message if neither auth mode is configured, or
the Gemini API call itself fails.
