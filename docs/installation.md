# Installation & Local Setup Guide

Step-by-step guide to get the full stack running locally: the Next.js web
app, the two Python FastAPI microservices, PostgreSQL, and Redis.

For architecture/design background, see `docs/plan.md`.

## Local URLs

| App | URL |
|---|---|
| Web app (login) | http://localhost:3002/login |
| Skin scanning service | http://localhost:3003 |
| Matching service | http://localhost:8000 |

## Database connection

| Key | Value |
|---|---|
| Host | `localhost` |
| Port | `5000` |
| Database | `bluebuilding` |
| Username | `bluebuilding` |
| Password | `bluebuilding` |
| Connection string | `postgresql://bluebuilding:bluebuilding@localhost:5000/bluebuilding` |

---

## 0. For automated setup scripts / agents

This section is written so an agent running commands via a shell tool (no
interactive terminals, no human watching) can bring up the whole stack
unattended. Every command below is **idempotent** — safe to run even if the
container/venv/process already exists — so this script can be re-run after
a partial failure without manual cleanup. Run from the repo root.

```bash
# --- 1. Postgres (create if missing, start if stopped) ---
if ! docker ps -a --format '{{.Names}}' | grep -q '^beauty-advisor-db$'; then
  docker run -d --name beauty-advisor-db \
    -e POSTGRES_USER=bluebuilding -e POSTGRES_PASSWORD=bluebuilding -e POSTGRES_DB=bluebuilding \
    -p 5000:5432 pgvector/pgvector:pg16
else
  docker start beauty-advisor-db >/dev/null 2>&1 || true
fi
until docker exec beauty-advisor-db pg_isready -U bluebuilding >/dev/null 2>&1; do sleep 1; done

# --- 2. Redis (create if missing, start if stopped) ---
if ! docker ps -a --format '{{.Names}}' | grep -q '^beauty-advisor-redis$'; then
  docker run -d --name beauty-advisor-redis -p 6380:6379 redis:7-alpine
else
  docker start beauty-advisor-redis >/dev/null 2>&1 || true
fi

# --- 3. Load data only if the `products` table is empty (don't clobber existing data) ---
ROW_COUNT=$(docker exec beauty-advisor-db psql -U bluebuilding -d bluebuilding -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_name='products'" 2>/dev/null || echo 0)
if [ "$ROW_COUNT" = "0" ]; then
  docker exec -i beauty-advisor-db psql -U bluebuilding -d bluebuilding < data/bluebuilding_full_dump.sql
fi

# --- 4. Web app deps ---
cd apps/web
[ -d node_modules ] || npm install
[ -f .env.local ] || cat > .env.local <<'EOF'
DATABASE_URL=postgresql://bluebuilding:bluebuilding@localhost:5000/bluebuilding
REDIS_URL=redis://localhost:6380
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:3002/api/auth/google/callback
MATCHING_SERVICE_URL=http://localhost:8000
SKIN_SCAN_SERVICE_URL=http://localhost:3003
EOF
cd ../..

# --- 5. Skin-scanning service deps (Python 3.12 required) ---
cd services/skin-scanning
[ -d .venv ] || python3.12 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f models/face_landmarker.task ] || python scripts/download_model.py
[ -f .env ] || cp .env.example .env
deactivate
cd ../..

# --- 6. Matching service deps ---
cd services/matching-service
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
deactivate
cd ../..

# --- 7. Start all three dev servers in the background with logs ---
# Skip any that are already listening on their port (idempotent re-run).
mkdir -p /tmp/beauty-advisor-logs

if ! lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  (cd services/matching-service && source .venv/bin/activate && \
    nohup uvicorn app.main:app --port 8000 > /tmp/beauty-advisor-logs/matching.log 2>&1 &)
fi

if ! lsof -iTCP:3003 -sTCP:LISTEN >/dev/null 2>&1; then
  (cd services/skin-scanning && source .venv/bin/activate && \
    nohup uvicorn app.main:app --port 3003 > /tmp/beauty-advisor-logs/skin-scan.log 2>&1 &)
fi

if ! lsof -iTCP:3002 -sTCP:LISTEN >/dev/null 2>&1; then
  (cd apps/web && nohup npm run dev -- -p 3002 > /tmp/beauty-advisor-logs/web.log 2>&1 &)
fi

# --- 8. Poll until all three health endpoints respond (max ~60s) ---
for i in $(seq 1 30); do
  ok=0
  curl -sf http://localhost:8000/health >/dev/null 2>&1 && ok=$((ok+1))
  curl -sf http://localhost:3003/health >/dev/null 2>&1 && ok=$((ok+1))
  curl -sf http://localhost:3002/login  >/dev/null 2>&1 && ok=$((ok+1))
  [ "$ok" = "3" ] && break
  sleep 2
done
echo "services healthy: $ok/3 (matching:8000, skin-scan:3003, web:3002)"
```

Notes for an agent running this unattended:

*   **Don't background with `&` at the top level of a single Bash call** —
    each `nohup ... &` above is wrapped in its own `( subshell )` so the
    parent shell doesn't wait on it; logs land in `/tmp/beauty-advisor-logs/`
    for debugging if a health check fails.
*   **Google OAuth is the one step that cannot be fully automated** — the
    placeholder `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` values let the web
    app boot and every other route function, but actually completing a login
    at `/login` requires real credentials from Google Cloud Console (see
    Section 4 below). If `.env.local` already exists with real values
    (e.g. this repo's working copy), step 4 leaves it untouched.
*   **Re-running is safe**: every step checks for existing state first
    (container name, `node_modules`, `.venv`, `.env` file, listening port)
    and skips work that's already done — use this same script to verify or
    repair a partially-up environment, not just for first-time setup.
*   To stop everything cleanly: `docker stop beauty-advisor-db beauty-advisor-redis`
    and kill the three `uvicorn`/`next dev` processes (`lsof -iTCP:3002,3003,8000 -sTCP:LISTEN`
    to find PIDs).

The rest of this document explains each step in more detail, for a human
running it manually in separate terminals.

---

## 1. Prerequisites

Install these before starting:

*   **Node.js** — a recent LTS version (18+), for the Next.js web app.
*   **Python 3.12** — required specifically for the skin-scanning service (MediaPipe does not support newer Python versions yet).
*   **Python 3** (any recent 3.x, e.g. 3.13/3.14) — for the matching service.
*   **Docker Desktop** — to run PostgreSQL and Redis as containers.
*   **Git**

---

## 2. Start the database (PostgreSQL + pgvector)

Run a Postgres container with the `pgvector` extension pre-installed, mapped
to port `5000` (non-standard, so it doesn't collide with a system Postgres
on `5432`):

```bash
docker run -d \
  --name beauty-advisor-db \
  -e POSTGRES_USER=bluebuilding \
  -e POSTGRES_PASSWORD=bluebuilding \
  -e POSTGRES_DB=bluebuilding \
  -p 5000:5432 \
  pgvector/pgvector:pg16
```

If the container already exists (e.g. from a previous setup), just start it
instead: `docker start beauty-advisor-db`.

Wait a few seconds for it to come up, then verify:

```bash
docker exec beauty-advisor-db pg_isready -U bluebuilding
```

### 2.1 Load the data — recommended: restore the full dump

The repo includes a complete export of the database at
`data/bluebuilding_full_dump.sql` (schema + all rows, including the full
product catalog, ~47MB). This is the fastest way to get a fully working
local DB, and has been verified to restore cleanly into a fresh container:

```bash
docker exec -i beauty-advisor-db psql -U bluebuilding -d bluebuilding \
  < data/bluebuilding_full_dump.sql
```

This single command creates all extensions, tables, indexes, and loads all
data (products, users, sessions, chat history, etc.) in one shot. Only run
this against an **empty** database — running it twice against a database
that already has the schema will error on `CREATE TABLE`/`CREATE EXTENSION`
(harmless, but noisy); check first with:

```bash
docker exec beauty-advisor-db psql -U bluebuilding -d bluebuilding -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_name='products'"
```

(`0` → safe to restore; `1` → already loaded, skip this step.)

### 2.2 Alternative: build the schema from scratch via migrations

Only use this path if you want an **empty** database with just the schema
(e.g. for a fresh environment without seed data). Run the numbered SQL
files in `data/` in order:

```bash
for f in data/01_alter_products_schema.sql \
         data/03_auth_schema.sql \
         data/04_chat_schema.sql \
         data/05_chat_pinned_greeting.sql \
         data/06_scan_image.sql; do
  docker exec -i beauty-advisor-db psql -U bluebuilding -d bluebuilding < "$f"
done
```

Note: `data/02_import_products.sql` expects a `beauty_product.csv` file
that is **not** checked into this repo (too large) — skip it and use the
full dump (2.1) instead if you need real product data.

---

## 3. Start Redis

Used for fast session-validity checks (backed by the `user_sessions` table
in Postgres as the durable record):

```bash
docker run -d \
  --name beauty-advisor-redis \
  -p 6380:6379 \
  redis:7-alpine
```

If it already exists: `docker start beauty-advisor-redis`.

---

## 4. Set up the web app (`apps/web`)

```bash
cd apps/web
npm install
```

Create `apps/web/.env.local`:

```bash
DATABASE_URL=postgresql://bluebuilding:bluebuilding@localhost:5000/bluebuilding
REDIS_URL=redis://localhost:6380

# Create an OAuth 2.0 Client ID (Web application) in Google Cloud Console:
# https://console.cloud.google.com/apis/credentials
# Authorized redirect URI: http://localhost:3002/api/auth/google/callback
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:3002/api/auth/google/callback

MATCHING_SERVICE_URL=http://localhost:8000
SKIN_SCAN_SERVICE_URL=http://localhost:3003
```

> You'll need your own Google OAuth credentials — ask a teammate for the
> project's existing OAuth client, or create a new one in Google Cloud
> Console and register the redirect URI above. Everything except actually
> completing a Google login works without this (the app, DB, and both
> services boot and respond fine with placeholder values).

Run the dev server:

```bash
npm run dev -- -p 3002
```

(Next.js's default dev port is 3000 — pass `-p 3002` explicitly so it
matches the OAuth redirect URI above and the URLs in this doc.)

Open **http://localhost:3002/login** to sign in with Google.

---

## 5. Set up the skin-scanning service (`services/skin-scanning`)

Requires **Python 3.12** specifically (MediaPipe doesn't yet support newer
Python versions):

```bash
cd services/skin-scanning
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_model.py   # one-time: fetches models/face_landmarker.task (~3.7MB)
cp .env.example .env
uvicorn app.main:app --reload --port 3003
```

Verify it's up: **http://localhost:3003/docs** (Swagger UI), or:

```bash
curl http://localhost:3003/health
```

---

## 6. Set up the matching service (`services/matching-service`)

```bash
cd services/matching-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # defaults to the DB connection details above; edit if needed
uvicorn app.main:app --reload --port 8000
```

Verify it's up: **http://localhost:8000/docs** (Swagger UI), or:

```bash
curl http://localhost:8000/health
```

---

## 7. Running everything together

Each component runs independently (there's no root-level orchestrator). For
manual/interactive use, start them in separate terminals in this order:

1. `docker start beauty-advisor-db beauty-advisor-redis` (if not already running)
2. Matching service: `cd services/matching-service && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`
3. Skin-scanning service: `cd services/skin-scanning && source .venv/bin/activate && uvicorn app.main:app --reload --port 3003`
4. Web app: `cd apps/web && npm run dev -- -p 3002`

Then visit **http://localhost:3002/login**.

For unattended/scripted setup (no interactive terminals), use the single
idempotent script in **Section 0** instead.

---

## 8. Troubleshooting

*   **Web app can't reach the database** — confirm the Postgres container is running (`docker ps`) and `DATABASE_URL` in `.env.local` matches the credentials in this doc.
*   **Skin-scan camera flow fails / "Couldn't analyze the photo"** — make sure `services/skin-scanning` is running on port 3003 and `SKIN_SCAN_SERVICE_URL` is set correctly in `.env.local`.
*   **Quiz/onboarding routine matching fails** — make sure `services/matching-service` is running on port 8000 and `MATCHING_SERVICE_URL` is set correctly.
*   **Scan shows "Pose: Off" and never takes the photo by itself** — the browser couldn't load MediaPipe's in-browser face tracker (fetched on first visit from `cdn.jsdelivr.net` and `storage.googleapis.com`), so hands-free capture is off. Check your network/ad-blocker; "Take photo now" and photo upload still work.
*   **`pip install` fails on `mediapipe`** — you're very likely not on Python 3.12. Re-create the virtualenv with `python3.12 -m venv .venv` explicitly.
*   **Login redirect fails** — your Google OAuth client's "Authorized redirect URI" must exactly match `http://localhost:3002/api/auth/google/callback`.
*   **`docker run` fails with "name already in use"** — a container from a previous setup already exists; use `docker start beauty-advisor-db` / `docker start beauty-advisor-redis` instead of `docker run`, or use the idempotent script in Section 0 which handles this automatically.
*   **Restoring the dump fails with "relation already exists"** — the database already has the schema loaded; this is harmless if you're re-running against a database that already has data, but means you don't need to restore again.
