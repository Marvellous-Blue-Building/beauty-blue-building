# AI-assisted skin-care advisor

AI-assisted skin-care advisor: a mobile-first web app that scans a user's skin
via their camera, matches it (plus an onboarding quiz) against a real product
catalog, and surfaces personalized routines and chat-based product advice.

## Monorepo layout

There's no root-level package manager or workspace tool — the web app and
each Python service are installed and run independently.

| Path | What it is |
|---|---|
| `apps/web` | Next.js (App Router) + Tailwind frontend. Auth, quiz, skin scan UI, shop, cart, chat, profile, and the guest-facing `/api/widget/*` surface for the embeddable widget. |
| `apps/web/public/widget-loader.js` | The embeddable AI Beauty Advisor widget — one `<script>` tag any retail site can drop in. Shadow DOM mounted, origin-gated, talks only to `apps/web`'s own `/api/widget/*` routes (the 4 Python services stay server-side). See "Embeddable widget" below. |
| `services/skin-scanning` | Python/FastAPI service. Real face-landmark analysis (MediaPipe + OpenCV) from a captured photo → skin metrics. |
| `services/matching-service` | Python/FastAPI service. Quiz/scan results → routine & product matching (SQL + keyword dictionaries). |
| `services/ai-advisor` | Python/FastAPI service. Gemma (via Kaggle Models) LLM fallback for chat messages the deterministic rules can't resolve. |

## Stack (as currently built)

- **Frontend:** Next.js (App Router, React), Tailwind CSS, `next-intl` (EN/ID), Zustand
- **Backend services:** Python 3 FastAPI (skin-scanning requires Python 3.12 specifically, for MediaPipe)
- **Database:** Self-hosted PostgreSQL (`pgvector/pgvector:pg16` Docker image)
- **Cache:** Redis (session-validity lookups)
- **Auth:** Custom Google OAuth 2.0 flow with server-side session cookies

## Embeddable widget (new)

Any beauty retail site can inject the AI advisor with one script tag:

```html
<script src="https://<your-deployment>/widget-loader.js" async></script>
```

It mounts inside a Shadow DOM (no iframe) as a floating launcher, talks to
`apps/web`'s guest-facing `/api/widget/{session,config,chat}` routes over
Server-Sent Events, and reuses the exact same matching-service/ai-advisor
pipeline the main app's authenticated chat uses — no mocked responses.
Guest conversations are stored separately from the authenticated app's data
(`widget_sessions` / `widget_conversations` / `widget_messages`, see
`data/14_widget_sessions.sql`), so no user account is required on the
visitor's side. Single-tenant per deployment: one backend serves one
retailer's own catalog, so there's no multi-tenant/organization scoping to
configure. Allowed embedding origins are set via `ALLOWED_WIDGET_ORIGINS` in
`apps/web/.env.local`.
