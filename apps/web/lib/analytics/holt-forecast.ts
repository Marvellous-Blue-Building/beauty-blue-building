/**
 * Holt's linear trend method (double exponential smoothing) — a real,
 * standard forecasting algorithm, not a fabricated score.
 *
 * Deliberately NOT full Holt-Winters (which adds a seasonal component):
 * the seasonal term needs a reliable season length (weekly/monthly cycles),
 * which requires at least 2 full seasonal periods of history to estimate.
 * This dataset's real activity history is hours/days old, not months, so
 * fitting a seasonal component now would be statistically meaningless (or
 * numerically unstable) rather than honest. Holt's method is exactly the
 * trend-only half of Holt-Winters — it degrades gracefully with short
 * series and is the textbook-correct choice until enough seasonal cycles
 * accumulate, at which point the seasonal term can be added back.
 *
 * Reference: Hyndman & Athanasopoulos, "Forecasting: Principles and
 * Practice" — Holt's linear trend method.
 */

export interface HoltResult {
  level: number;
  trend: "up" | "down" | "flat";
  trendValue: number;
  forecastNextPeriod: number;
  dataPoints: number;
  /** The fitted level at each input step, same length as `series` — the
   * "baseline" line a Forecast vs Aktual chart plots alongside the raw
   * actual series (added for the wireframe-matching redesign's charts). */
  fittedLevels: number[];
}

/**
 * @param series Observed values in chronological order (one per time
 * bucket — this project uses hourly buckets of combined cart+chat signal).
 * @param alpha Level smoothing constant (0-1). Higher = more weight on
 * recent observations.
 * @param beta Trend smoothing constant (0-1).
 */
export function holtLinearForecast(series: number[], alpha = 0.3, beta = 0.2): HoltResult {
  if (series.length === 0) {
    return { level: 0, trend: "flat", trendValue: 0, forecastNextPeriod: 0, dataPoints: 0, fittedLevels: [] };
  }
  if (series.length === 1) {
    // Not enough points to estimate a trend — level-only forecast.
    return { level: series[0], trend: "flat", trendValue: 0, forecastNextPeriod: series[0], dataPoints: 1, fittedLevels: [series[0]] };
  }

  let level = series[0];
  let trend = series[1] - series[0];
  const fittedLevels = [level];

  for (let t = 1; t < series.length; t++) {
    const value = series[t];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fittedLevels.push(level);
  }

  const forecastNextPeriod = Math.max(0, level + trend);
  const direction: HoltResult["trend"] = trend > 0.15 ? "up" : trend < -0.15 ? "down" : "flat";

  return {
    level: Math.max(0, level),
    trend: direction,
    trendValue: trend,
    forecastNextPeriod,
    dataPoints: series.length,
    fittedLevels,
  };
}
