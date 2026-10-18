"use client";

import { useLocale } from "next-intl";
import type { ScanReport } from "@/types/scan";
import { isMeasured, measurementCopy } from "@/lib/scan/measurement-copy";

export function VisualMeasurements({ report }: { report: ScanReport }) {
  const locale = useLocale();
  const copy = measurementCopy(locale);
  return <section className="mb-5 rounded-[22px] border border-border bg-surface p-4">
    <span className="rounded-full bg-primary-dim px-3 py-1 text-[10px] font-semibold text-primary">{copy.badge}</span>
    <h2 className="mt-3 font-display text-[24px] text-canvas-ink">{copy.title}</h2>
    <p className="mt-2 text-[12px] leading-relaxed text-canvas-ink-muted">{copy.intro}</p>
    <details className="mt-3 text-[11px] leading-relaxed text-canvas-ink-muted"><summary className="cursor-pointer font-semibold">{copy.details}</summary><p className="mt-2">{copy.interpretation}</p></details>
    <div className="mt-4 grid gap-3">
      {(report.measurements ?? []).map(reading => <article key={reading.key} className="rounded-2xl border border-border bg-app-bg p-3.5">
        <div className="flex justify-between gap-3">
          <h3 className="text-[13px] font-semibold">{copy.labels[reading.key] ?? reading.key}</h3>
          <span className="text-[10px] text-canvas-ink-muted">{isMeasured(reading) ? copy.measured : copy.unavailable}</span>
        </div>
        <p className="mt-2 font-mono text-xl text-canvas-ink">{isMeasured(reading) ? reading.value.toFixed(2) : "—"}
          {isMeasured(reading) && <span className="ml-2 font-sans text-[10px] text-canvas-ink-muted">{copy.unit}</span>}
        </p>
        <p className="mt-1 text-[11px] text-canvas-ink-muted">{copy.source} · {reading.samplePixels.toLocaleString(locale)} {copy.pixels}</p>
        {isMeasured(reading) ? <>
          <div className="mt-3 flex justify-between text-[10px] text-canvas-ink-muted"><span>{copy.coverage}</span><span>{Math.round(reading.coverage * 100)}%</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, reading.coverage)) * 100}%` }} /></div>
        </> : <p className="mt-2 text-[11px] leading-relaxed text-canvas-ink-muted">{copy.reasons[reading.reason ?? ""] ?? copy.reasons.invalid_signal}</p>}
      </article>)}
    </div>
    {!report.measurements?.length && <p className="mt-3 text-[12px]">{copy.legacy}</p>}
    <p className="mt-4 rounded-xl bg-primary-dim p-3 text-[11px] leading-relaxed text-canvas-ink-muted">{copy.noScores}</p>
  </section>;
}
