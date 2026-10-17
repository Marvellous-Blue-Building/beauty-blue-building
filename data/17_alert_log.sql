-- Phase 3 wireframe redesign — alert feedback loop ("Tindak lanjuti /
-- Diabaikan / Salah alarm" from Demand Signal System.md's own alert_log
-- design, "Aturan anti-kebisingan": "Setiap alert punya tombol balasan
-- ... masuk alert_log untuk kalibrasi"). Makes the CUSUM alert concept
-- actionable instead of read-only.
CREATE TABLE IF NOT EXISTS alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alarm_level SMALLINT NOT NULL,
  cusum NUMERIC NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('tindak_lanjut', 'diabaikan', 'salah_alarm')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_log_product ON alert_log (product_id, created_at DESC);
