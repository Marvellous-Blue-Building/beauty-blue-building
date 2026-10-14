# ai-advisor

FastAPI service that answers chat messages the deterministic rule set and
dictionary/keyword matching (`apps/web/lib/chat/bot-reply.ts`,
`apps/web/lib/rag/`) can't resolve — i.e. genuinely ambiguous or open-ended
questions the "as-is" matching has no rule or keyword for.

Uses Google's **Gemma** model, downloaded from
[Kaggle Models](https://www.kaggle.com/models/google/gemma-2) via
`kagglehub` and served with Hugging Face `transformers`. Defaults to the
`gemma-2-2b-it` (instruction-tuned, 2B parameter) variant since it's the only
size practical to run on CPU for local dev — swap `GEMMA_KAGGLE_HANDLE` for a
larger variant if you have a GPU.

This is a real local LLM call, not a scripted/templated reply — but keep
expectations honest: it's a small instruction-tuned model, not clinically
validated dermatological advice. The system prompt tells it to recommend a
dermatologist for anything that sounds medical rather than freelancing a
diagnosis. It's instructed to always reply in Bahasa Indonesia regardless
of what language the question is asked in — there's no `locale` field on
the request.

## Setup

Requires a free Kaggle account:

1. Create an API token: https://www.kaggle.com/settings → API → "Create New Token" (downloads `kaggle.json`).
2. Accept the Gemma license on the model page: https://www.kaggle.com/models/google/gemma-2

```bash
cd services/ai-advisor
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in KAGGLE_USERNAME / KAGGLE_KEY from kaggle.json
uvicorn app.main:app --reload --port 3004
```

Swagger UI: http://localhost:3004/docs

The model is **not** downloaded/loaded at startup — the first `/advise`
request after boot pays that one-time cost (weights download + load into
memory), so the service's own startup and `/health` check stay fast. Expect
the first chat fallback after a fresh start to take noticeably longer than
subsequent ones.

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

Returns `503` with a `detail` message if the model fails to download/load
(e.g. missing/invalid Kaggle credentials, license not accepted, or no
network access).
