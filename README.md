# AI-assisted skin-care advisor

AI-assisted skin-care advisor: a mobile-first web app that scans a user's skin
via their camera, matches it (plus an onboarding quiz) against a real product
catalog, and surfaces personalized routines and chat-based product advice.

## Monorepo layout

There's no root-level package manager or workspace tool — the web app and
each Python service are installed and run independently.

| Path | What it is |
|---|---|
| `apps/web` | Next.js (App Router) + Tailwind frontend. Auth, quiz, skin scan UI, shop, cart, chat, profile. |
| `services/skin-scanning` | Python/FastAPI service. Real face-landmark analysis (MediaPipe + OpenCV) from a captured photo → skin metrics. |
| `services/matching-service` | Python/FastAPI service. Quiz/scan results → routine & product matching (SQL + keyword dictionaries). |

## Stack (as currently built)

- **Frontend:** Next.js (App Router, React), Tailwind CSS, `next-intl` (EN/ID), Zustand
- **Backend services:** Python 3 FastAPI (skin-scanning requires Python 3.12 specifically, for MediaPipe)
- **Database:** Self-hosted PostgreSQL (`pgvector/pgvector:pg16` Docker image)
- **Cache:** Redis (session-validity lookups)
- **Auth:** Custom Google OAuth 2.0 flow with server-side session cookies
