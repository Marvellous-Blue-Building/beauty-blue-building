-- Phase 2 (Event, Promo, Uplift & Attribution — see
-- apps/web/Event, Promo, Uplift & Attribution.md, "Modul 1: Kalender event
-- & promo"). Scoped to the columns this project can actually fill in and
-- compute against (no POS/location/visitor-count ingestion), matching the
-- same honest-scoping convention as data/15_tenant_boosts.sql.
CREATE TABLE IF NOT EXISTS event_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- event_offline | promo_marketplace | promo_brand | campaign | seasonal
  sub_type TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  category_focus TEXT, -- matches products.category (free text)
  discount_pct NUMERIC,
  ad_budget NUMERIC,
  promo_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'rencana'
    CHECK (status IN ('rencana', 'disetujui', 'berjalan', 'selesai', 'batal')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_calendar_status ON event_calendar (status);
CREATE INDEX IF NOT EXISTS idx_event_calendar_dates ON event_calendar (starts_at, ends_at);

-- Modul 4 (Attribution, Lapis 1): a guest widget session can carry a promo
-- code read from the retailer page's own URL (?promo=...), the same UTM
-- capture idea as the spec's priority-4 attribution rule.
ALTER TABLE widget_sessions ADD COLUMN IF NOT EXISTS promo_code TEXT;
CREATE INDEX IF NOT EXISTS idx_widget_sessions_promo ON widget_sessions (promo_code) WHERE promo_code IS NOT NULL;
