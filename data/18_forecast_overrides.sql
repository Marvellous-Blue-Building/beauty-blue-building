-- Phase 3 wireframe redesign — manual forecast override, mandatory reason
-- (Knowledge Base "Tata kelola, ritual S&OP": "Setiap penyesuaian manual
-- terhadap forecast model dicatat beserta alasannya. Tiga bulan kemudian
-- bandingkan: mana yang lebih akurat, model atau penyesuaian manual.").
-- The model's own forecast is never overwritten — this is logged
-- alongside it, shown side by side in the Detail SKU tab.
CREATE TABLE IF NOT EXISTS forecast_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  override_value NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forecast_overrides_product ON forecast_overrides (product_id, created_at DESC);
