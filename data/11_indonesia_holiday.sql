-- Indonesia's national holiday calendar, fetched from
-- https://api.kemendesa.link/libur-nasional/api/holidays/<year>.json on
-- every register/login/relogin (see lib/indonesia-holiday.ts) and upserted
-- here — the first fetch for a given year inserts, every later fetch
-- (relogin, or a fresh year) updates the same rows instead of duplicating.
-- Consumed by services/geotagging-weather's formula to decide whether
-- today falls on a holiday for its combined holiday+weather context.
CREATE TABLE IF NOT EXISTS indonesia_holiday (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  is_civic boolean NOT NULL DEFAULT false,
  is_religious boolean NOT NULL DEFAULT false,
  is_cuti_bersama boolean NOT NULL DEFAULT false,
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (holiday_date, name)
);

CREATE INDEX IF NOT EXISTS idx_indonesia_holiday_date ON indonesia_holiday (holiday_date);
CREATE INDEX IF NOT EXISTS idx_indonesia_holiday_year ON indonesia_holiday (year);
