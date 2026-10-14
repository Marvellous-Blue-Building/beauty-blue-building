import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { BAND_STYLE, scoreBand, type MetricKey } from "@/lib/scan/score-bands";
import { MetricIcon } from "@/components/scan/MetricIcon";

/** One report score: what it measures, its rating, and a tip when it's low. */
export function MetricCard({ metric, value }: { metric: MetricKey; value: number }) {
  const t = useTranslations("diagnostic");
  const band = scoreBand(value);
  const needsTip = band === "fair" || band === "needsCare";

  return (
    <div className="mb-2.5 rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-dim text-primary">
          <MetricIcon metric={metric} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-bold text-canvas-ink">{t(metric)}</span>
            <span className="font-mono text-[17px] font-bold text-canvas-ink tabular-nums">
              {Math.round(value)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-canvas-ink-muted">
            <i className={cn("h-2 w-2 rounded-full", BAND_STYLE[band].dot)} />
            {t(`bands.${band}`)}
          </div>
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            "h-full animate-[bar-grow_0.9s_ease-out] rounded-full bg-gradient-to-r",
            BAND_STYLE[band].bar
          )}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-canvas-ink-muted">
        {t(`metrics.${metric}.what`)}
      </p>
      {needsTip && (
        <p className="mt-2 rounded-xl bg-mint-dim px-2.5 py-2 text-[11.5px] leading-relaxed text-canvas-ink">
          <span className="font-bold">{t("tipLabel")}: </span>
          {t(`metrics.${metric}.tip`)}
        </p>
      )}
    </div>
  );
}
