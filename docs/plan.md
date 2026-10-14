# Comprehensive System Specification & Technical Architecture

> **Note on this document:** Sections below were written as the original target
> design. As-built reality (current local dev environment, as of 2026-10-14) is
> called out inline wherever it diverges — see especially the **As-Built**
> callouts in Sections 1–4 and the new **Section 7 (Current Implementation
> Status)** for a straight list of what's actually running today. For step-by-
> step local setup, see `docs/installation.md`.

## 1. Executive Summary & Tech Stack Overview
This document outlines the end-to-end architecture, database schema, RAG pipeline, and feature specifications for the responsive mobile-first web application based on `wireframe_real_ui.html` (excluding native skin scan/CV scanning replaced by an iframe approach).

### Technology Stack (original target design)
*   **Frontend:** Next.js (App Router, React) + Tailwind CSS (Responsive, Mobile-First Design).
*   **Backend (CV + LLM Service):** Python FastAPI, deployed as a container on Google Cloud Run.
*   **Database:** Google Cloud SQL for PostgreSQL (Managed Postgres with `pgvector` extension enabled).
*   **Authentication:** Firebase Authentication (Login by Google).
*   **File Storage:** Google Cloud Storage (GCS) for user profile avatars, selfies, and tracking photos.
*   **AI Orchestration & RAG:** LangChain / LlamaIndex, Sentence-Transformers embeddings, custom hybrid matching pipeline.

### As-Built Technology Stack (current local dev)
*   **Frontend:** Next.js (App Router, React) + Tailwind CSS, `apps/web`, served at `http://localhost:3002`.
*   **Skin-scan service:** Python 3.12 FastAPI microservice at `services/skin-scanning`, served at `http://localhost:3003` — **not** an iframe; it's a real server-side analyzer (MediaPipe FaceLandmarker + OpenCV) called from the Next.js app via a server-side proxy route (`app/api/scan-analyze/route.ts`).
*   **Routine-matching service:** Python FastAPI microservice at `services/matching-service`, served at `http://localhost:8000` — a faithful port of the quiz/scan → routine matching logic (SQL + keyword dictionaries + progressive constraint relaxation). No embeddings/pgvector, no LLM call yet.
*   **Database:** Self-hosted PostgreSQL (`pgvector/pgvector:pg16` Docker image) on `localhost:5000`, database `bluebuilding` — not a managed Cloud SQL instance. `pgvector` extension is installed but not yet used by any query (no embedding columns are populated).
*   **Session cache:** Redis (Docker, `redis:7-alpine`) on `localhost:6380`, used for fast session-validity lookups backed by a `user_sessions` table in Postgres.
*   **Authentication:** Custom Google OAuth 2.0 flow (`app/api/auth/google`, `app/api/auth/google/callback`) with server-side session cookies — **not** Firebase Auth.
*   **File storage:** None yet — no GCS integration; avatars/scan photos are stored inline (e.g. `scan_results.image_data` as a base64 data URL in Postgres).
*   **AI Orchestration & RAG:** Not yet implemented — current matching is deterministic SQL/dictionary matching (see Section 4 for which pipeline steps are live vs. planned). No LangChain/LlamaIndex, no LLM synthesis call, no Sentence-Transformers embeddings in the running code yet.

---

## 2. Skin Scan & Scanning Section (Iframe Integration)
*   **Approach (original plan):** The native scanning UI is replaced by an `iframe` pointing to an external skin-analysis URL.
*   **Data Exchange Protocol (original plan):**
    *   The iframe communicates with the Next.js parent window using `window.postMessage`.
    *   Upon completion, the external iframe posts a structured JSON payload containing scan metrics (e.g., hydration, pigmentation, acne score, wrinkle depth, barrier status).
    *   The Next.js frontend captures this JSON, forwards it to the FastAPI backend, which saves it to PostgreSQL and triggers the hybrid RAG recommendation pipeline.
*   **As-built:** The iframe/postMessage approach was dropped. `apps/web/components/scan/NativeSkinScanEngine.tsx` captures a camera frame client-side and POSTs it directly to `app/api/scan-analyze/route.ts`, which proxies to the real `services/skin-scanning` FastAPI service (`POST /analyze`). The service runs MediaPipe FaceLandmarker (468 3D landmarks) against 6 skin zones and returns real pixel-level metrics (hydration, elasticity, pigmentation, texture, pores, overall score) plus flagged zones — not a mocked/static payload. Results are persisted to the `scan_results` table (see `data/06_scan_image.sql` for the `image_data` column added to keep the captured photo alongside the metrics).

---

## 3. Database Schema & Best Practices (PostgreSQL + pgvector)

> **As-built note:** The schema below is the original aspirational design.
> The real, currently-running schema is defined incrementally by the numbered
> migrations in `data/01_alter_products_schema.sql` through
> `data/06_scan_image.sql`, and a full data dump (schema + all rows) is
> checked into `data/bluebuilding_full_dump.sql`. Key differences from the
> design below: `users.firebase_uid` is reused to store the Google OAuth
> `sub` claim (no Firebase involved), `users` also has a `preferences JSONB`
> column (ethical toggles: vegan/crueltyFree/fragranceFree) and a
> `day_streak INT`; there's an additional `user_sessions` table for auth,
> and `chat_conversations`/`chat_messages` tables for the AI advisor chat
> (not shown in the original design). `products` has many more real-world
> columns (sku, parent_sku, stock_quantity, category, rating, etc.) than the
> simplified table below, and its `embedding` column is not yet populated.

### Best Practices Implemented:
1.  **UUIDv7 / Serial IDs:** Using UUIDs for users and products to ensure safe distribution and security.
2.  **JSONB for Flexible Schemas:** Questionnaire responses and iframe JSON scan results are stored in `JSONB` columns with GIN indexes for flexible querying without altering table structures.
3.  **Vector Indexing (`pgvector`):** Using `ivfflat` or `hnsw` indexes on product embedding vectors (`vector(1536)` or `vector(384)` depending on the embedding model) for lightning-fast semantic similarity searches.

### SQL Schema Definition

```sql
-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    send_report_email BOOLEAN DEFAULT FALSE,
    locale VARCHAR(5) DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Questionnaire Submissions
CREATE TABLE questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    responses JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Skin Scan Results (from Iframe JSON)
CREATE TABLE scan_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    raw_json_data JSONB NOT NULL,
    hydration_score NUMERIC(5,2),
    acne_score NUMERIC(5,2),
    pigmentation_score NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products Catalog with Vector Embeddings
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    image_url TEXT,
    ingredients TEXT[],
    embedding vector(384), -- Sentence-Transformers dimension size
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for Vector Search
CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops);

-- Shopping Cart Table
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INT DEFAULT 1,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- Saved Products (Favorites / Wishlist)
CREATE TABLE saved_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);
```

---

## 4. Advanced Hybrid RAG Product Recommendation Pipeline
When a user finishes analysis or queries the AI advisor chat, the backend executes a 14-step multi-stage retrieval and reasoning pipeline (original design):

1.  **Text Normalization:** Lowercasing, removing diacritics, stripping special punctuation from user queries and scan results. ✅ implemented
2.  **Exact / Dictionary Matching:** Checking against known skin concern dictionaries (e.g., "salicylic acid", "retinol"). ✅ implemented (`lib/rag/dictionaries.ts`, ported to `services/matching-service`)
3.  **PostgreSQL FTS (Full-Text Search):** Using `tsvector` and `tsquery` for keyword-based relevance matching in product descriptions and ingredients. ✅ implemented (`search_vector` column + GIN index, `data/01_alter_products_schema.sql`)
4.  **Regex / Structured Extraction:** Extracting explicit constraints (e.g., price limits, specific brand exclusions, ingredient avoidance). ✅ implemented (budget/ethics constraints in the quiz → matching flow)
5.  **RapidFuzz:** Fuzzy string matching to catch typos in user queries or ingredient names. ⬜ not yet implemented
6.  **Entity Extraction + Canonicalization:** Mapping synonyms (e.g., "Vit C" -> "Vitamin C", "BHA" -> "Salicylic Acid"). ⬜ not yet implemented
7.  **Intent Classification:** Categorizing user input (e.g., `product_recommendation`, `ingredient_inquiry`, `routine_advice`). ⬜ not yet implemented
8.  **Sentence-Transformers Embedding:** Embedding the normalized user query/scan summary into a dense vector space. ⬜ not yet implemented — no embedding model wired up
9.  **pgvector Semantic Search:** Executing cosine similarity search against the `products` table embedding index (`ORDER BY embedding <=> query_vector`). ⬜ not yet implemented — `pgvector` extension is installed but `products.embedding` is unpopulated
10. **Candidate Merge + Scoring:** Combining results from FTS, dictionary matching, and vector search into a unified candidate pool with weighted scores. ◐ partial — merges FTS + dictionary matches only, via progressive constraint relaxation; no vector search to merge yet
11. **Context / Conversation-State Resolution:** Injecting prior chat history, user skin type from questionnaires, and iframe scan scores into the evaluation context. ◐ partial — chat history persists in `chat_conversations`/`chat_messages`, but isn't yet fed back into the matching/recommendation context
12. **Confidence + Ambiguity Detection:** Scoring recommendation confidence; triggering clarification prompts if ambiguity is high. ⬜ not yet implemented
13. **Structured Understanding Object:** Assembling a final validated JSON context object for the LLM. ⬜ not yet implemented
14. **LLM Synthesis:** FastAPI calls the LLM (via LangChain/LlamaIndex) to generate a personalized, conversational, and empathetic response tailored to user inputs and localized needs. ⬜ not yet implemented — chat currently returns rule-based responses, no LLM call

**Current reality in one line:** steps 1–4 (and a scoped-down version of 10) run today inside `services/matching-service` as deterministic SQL + dictionary logic; steps 5–9 and 11–14 (fuzzy matching, embeddings/vector search, intent classification, LLM synthesis) are still on the roadmap.

---

## 5. Frontend UI & Feature Specifications

### 1. Profile Picture & Cropping Workflow
*   **Trigger:** Clicking the user profile image directly opens the device gallery (via `<input type="file" accept="image/png, image/jpeg, image/jpg" />`).
*   **Validation:** Client-side check ensures file size $\le 5\text{ MB}$ and supported format (`png`, `jpeg`, `jpg`).
*   **Crop Layout:** Opens a modal displaying a simple crop overlay (using libraries like `react-image-crop`). Once confirmed, the cropped image blob is uploaded directly to Google Cloud Storage (GCS), and the public URL is saved to the user's PostgreSQL profile record.

### 2. Add to Cart & Save Behavior (Interactive Feedback)
*   **Add to Cart:** Clicking "Add to Cart" saves the item to the `cart_items` table in DB, triggers an API call, and displays a transient floating popup message for exactly 2 seconds: `"[product name] is added to your cart"`.
*   **Heart Icon (Save/Wishlist):** Toggling the heart icon adds or removes the item from `saved_products` in DB, displaying a 2-second popup: `"Added to Saved Products"` (or corresponding localized string).
*   **Persistent State:** Cart and saved items persist across login sessions.
*   **Profile Section Display Limit:** The profile dashboard displays a preview list capped at a **maximum of 5 items** for both "Saved Products" and "Your Cart", with a "View All" link.

### 3. Email Report Automation
*   **Flagging:** When the user checks the option *"Send my report to email"*, the `users.send_report_email` boolean flag is updated to `TRUE` in the database.
*   **Trigger:** Immediately upon completion of the skin analysis iframe data sync, the FastAPI backend invokes a background SMTP worker task (e.g., via Celery or FastAPI BackgroundTasks) to compile the analysis report PDF/HTML and email it to the user's authenticated email address.

### 4. Localization (EN & ID)
*   **Implementation:** Next.js internationalization routing (`next-intl`) supporting English (`en`) and Indonesian (`id`).
*   **Database & UI Strings:** All static UI labels, error messages, and dynamic AI responses adapt seamlessly based on the user's selected locale stored in `users.locale`.

---

## 6. Deployment Architecture
*   **Next.js Frontend:** Hosted on Vercel or Google Cloud Run. *(Target — not yet deployed; current dev runs locally on `localhost:3002`.)*
*   **FastAPI Backend:** Containerized via `Dockerfile` and deployed on Google Cloud Run with auto-scaling. *(Target — the two FastAPI services currently run locally via `uvicorn --reload`, no Dockerfile/Cloud Run setup yet.)*
*   **Database:** Google Cloud SQL PostgreSQL instance configured in private VPC with secure connection strings. *(Target — current dev DB is a local Docker container, `pgvector/pgvector:pg16`, port 5000.)*
*   **Storage:** GCS bucket configured with CORS policies for direct secure uploads from the client. *(Target — not yet implemented.)*

---

## 7. Current Implementation Status & Recent Changes (as of 2026-10-14)

This section is a living log of what's actually running, independent of the
original design above. For full local setup instructions, see
`docs/installation.md`.

### 7.1 Services running today
| Component | Tech | Local URL | Notes |
|---|---|---|---|
| Web app | Next.js (App Router) | `http://localhost:3002` | Custom Google OAuth login at `/login` |
| Skin-scanning service | Python 3.12 FastAPI + MediaPipe | `http://localhost:3003` | Real face-landmark analysis, not mocked |
| Matching service | Python FastAPI | `http://localhost:8000` | Quiz/scan → routine matching (SQL + dictionaries) |
| PostgreSQL | `pgvector/pgvector:pg16` (Docker) | `localhost:5000` | DB `bluebuilding`, see Section 3 note |
| Redis | `redis:7-alpine` (Docker) | `localhost:6380` | Session-validity cache |

There is no root-level package manager/monorepo tool (no turborepo, no pnpm
workspace) — the web app and each Python service are installed and run
independently.

### 7.2 Recent changes
*   **Skin-scanning service merged in:** `services/skin-scanning` was built out as a full FastAPI replacement for the old iframe-based mock scan tool, based on the wireframe prototype's scan-service spec. It's now the live implementation described in Section 2.
*   **Shop product filter — budget now actually filters results:** The budget slider in the Shop filter dialog previously updated local UI state only and was never sent to the backend. It's now persisted on "Apply" and passed to `GET /api/products` as a `maxPrice` query param, which the route applies as a real `price <= $maxPrice` SQL filter. Ethical preference toggles (vegan / cruelty-free / fragrance-free) were already wired end-to-end and are unaffected.
*   **Filter dialog Cancel/Apply buttons fixed:** The dialog referenced `common.apply` / `common.cancel` translation keys that didn't exist in `messages/en.json` / `messages/id.json` (buttons rendered blank/raw key names). Both keys were added in English and Indonesian.
*   **Full DB export checked in:** `data/bluebuilding_full_dump.sql` is a complete `pg_dump` of the `bluebuilding` database (schema + all rows, ~47 MB) for fresh local setup — see `docs/installation.md`.