-- Guarantees a given real scan (identified by its own scanId, from the
-- skin-scanning service's ScanReport) is only ever stored once per user —
-- the backing guarantee for "send the diagnosis PDF email exactly once per
-- stored scan result", immune to network retries / double form submits
-- re-POSTing the same report to /api/match-routine or /api/scan-result.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_results_user_scan_id
  ON scan_results (user_id, (raw_json_data->>'scanId'))
  WHERE raw_json_data->>'scanId' IS NOT NULL;
