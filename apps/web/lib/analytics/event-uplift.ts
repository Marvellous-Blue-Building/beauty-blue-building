/**
 * Event uplift — Phase 2 Modul 2 & 3 (see "Event, Promo, Uplift &
 * Attribution.md"), scoped to the two tiers the spec itself sanctions for
 * a project without 6+ months of per-channel sales data:
 *
 * - Modul 2 ("Tingkat C — rasio sederhana"): uplift bersih = (rata-rata
 *   sinyal selama jendela event / median sinyal jendela bersih) − 1. This
 *   project only has hourly cart+chat activity signal (no daily sales), so
 *   "jendela bersih" here is the same signal in the weeks immediately
 *   before the event, excluding any hour that falls inside another
 *   event's window.
 * - Modul 3 Tahap 1 (lookup table): uplift estimasi = median(uplift bersih
 *   dari event historis sub-tipe sama) * f(diskon). The visitor-count
 *   scaling term `(pengunjung/median)^0.7` from the KB is dropped — this
 *   project doesn't capture visitor counts for offline events — and that
 *   omission is surfaced in the API response, not hidden.
 *
 * Neither tier claims to be the spec's Tingkat A/B baselines (synthetic
 * control, Holt-Winters-trained-on-clean-window) or the Tahap 2 LightGBM
 * regression — those need more historical events and channel-level data
 * than this project has yet.
 */

import { median, mad } from "./robust-zscore";

export interface HistoricalUpliftResult {
  /** (eventAvg - baselineMedian) / baselineMedian, or null if baseline is 0 (no comparable signal). */
  upliftBersih: number | null;
  method: "tingkat_c";
  /** True when |upliftBersih| exceeds the clean window's own noise band — the spec's own bar for "signifikan". */
  significant: boolean;
  intervalLow: number | null;
  intervalHigh: number | null;
}

export function computeHistoricalUplift(eventWindowSeries: number[], cleanBaselineSeries: number[]): HistoricalUpliftResult {
  const baselineMedian = median(cleanBaselineSeries);
  if (eventWindowSeries.length === 0 || baselineMedian <= 0) {
    return { upliftBersih: null, method: "tingkat_c", significant: false, intervalLow: null, intervalHigh: null };
  }
  const eventAvg = eventWindowSeries.reduce((a, b) => a + b, 0) / eventWindowSeries.length;
  const upliftBersih = (eventAvg - baselineMedian) / baselineMedian;

  const baselineMad = mad(cleanBaselineSeries);
  const noiseBand = (1.4826 * baselineMad) / baselineMedian;
  const significant = Math.abs(upliftBersih) > noiseBand;

  return {
    upliftBersih,
    method: "tingkat_c",
    significant,
    intervalLow: upliftBersih - noiseBand,
    intervalHigh: upliftBersih + noiseBand,
  };
}

export interface HistoricalEventForLookup {
  subType: string | null;
  discountPct: number | null;
  upliftBersih: number;
}

export interface UpcomingUpliftResult {
  upliftEstimasi: number | null;
  /** "lookup": matched same sub_type among significant historical events. "estimasi_kasar": no same-sub-type match (or no historical data at all) — the spec's own fallback label. */
  basis: "lookup" | "estimasi_kasar";
}

export function estimateUpcomingUplift(
  event: { subType: string | null; discountPct: number | null },
  historical: HistoricalEventForLookup[]
): UpcomingUpliftResult {
  if (historical.length === 0) return { upliftEstimasi: null, basis: "estimasi_kasar" };

  const sameSubType = event.subType ? historical.filter((h) => h.subType === event.subType) : [];
  const pool = sameSubType.length > 0 ? sameSubType : historical;
  const basis: UpcomingUpliftResult["basis"] = sameSubType.length > 0 ? "lookup" : "estimasi_kasar";

  const baseUplift = median(pool.map((h) => h.upliftBersih));
  const medianDiscountPct = median(pool.map((h) => h.discountPct ?? 0));
  const eventDiscountPct = event.discountPct ?? medianDiscountPct;
  // f(diskon) = 1 + 1.5 * (diskon_event − diskon_median), discount expressed as a fraction (0–1), per the KB formula.
  const f = 1 + 1.5 * ((eventDiscountPct - medianDiscountPct) / 100);

  return { upliftEstimasi: baseUplift * f, basis };
}
