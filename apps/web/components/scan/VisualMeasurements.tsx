"use client";

import { useLocale } from "next-intl";
import type { ScanReport } from "@/types/scan";
import { isMeasured, measurementCopy, visualScore } from "@/lib/scan/measurement-copy";

export function VisualMeasurements({ report }: { report: ScanReport }) {
  const locale = useLocale();
  const copy = measurementCopy(locale);
  return <section className="mb-5 rounded-[22px] border border-border bg-surface p-4">
    <span className="rounded-full bg-primary-dim px-3 py-1 text-[10px] font-semibold text-primary">{copy.badge}</span>
    <h2 className="mt-3 font-display text-[24px] text-canvas-ink">{copy.title}</h2>
    <p className="mt-2 text-[12px] leading-relaxed text-canvas-ink-muted">{copy.intro}</p>
    <details className="mt-3 text-[11px] leading-relaxed text-canvas-ink-muted"><summary className="cursor-pointer font-semibold">{copy.details}</summary><p className="mt-2">{copy.interpretation}</p></details>
    <div className="mt-4 grid gap-3">
      {(report.measurements ?? []).map(reading => {
        const score = visualScore(reading);
        return <article key={reading.key} className="rounded-2xl border border-border bg-app-bg p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[14px] font-medium">{copy.labels[reading.key] ?? reading.key}</h3>
            <span className="shrink-0 text-canvas-ink-muted">{score !== null ? <><strong className="text-xl font-semibold tabular-nums text-primary">{score}</strong><span className="ml-1 text-[11px]">/ 100</span></> : <span className="text-[11px]">{copy.unavailable}</span>}</span>
          </div>
          {score !== null ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-dim" role="meter" aria-label={copy.labels[reading.key] ?? reading.key} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#F3A88E] to-primary" style={{ width: `${score}%` }} />
          </div> : <p className="mt-2 text-[11px] leading-relaxed text-canvas-ink-muted">{copy.reasons[reading.reason ?? ""] ?? copy.reasons.invalid_signal}</p>}
          {score !== null && <details className="mt-3 text-[10px] leading-relaxed text-canvas-ink-muted">
            <summary className="cursor-pointer">{copy.measured} · {copy.source}</summary>
            <p className="mt-2">{isMeasured(reading) ? reading.value.toFixed(2) : "—"} {copy.unit} · {reading.samplePixels.toLocaleString(locale)} {copy.pixels}</p>
            <p>{copy.coverage}: {Math.round(reading.coverage * 100)}%</p>
          </details>}
        </article>;
      })}
    </div>
    {!report.measurements?.length && <p className="mt-3 text-[12px]">{copy.legacy}</p>}
    <p className="mt-4 rounded-xl bg-primary-dim p-3 text-[11px] leading-relaxed text-canvas-ink-muted">{copy.noScores}</p>
  </section>;
}
