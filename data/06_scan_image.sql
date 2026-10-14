-- Weekly check-in submissions store the captured photo alongside the metrics.
--
-- The diagnostic report's "Submit scan" action (progress/check-in flow) is the
-- point a returning user commits a new photo to their history, so the actual
-- image the metrics were computed from is kept with the row (as a base64 data
-- URL) instead of only the derived scores. Column is nullable so the baseline
-- scan+quiz rows (written from /api/match-routine) remain valid without a photo.
ALTER TABLE scan_results
  ADD COLUMN IF NOT EXISTS image_data TEXT;
