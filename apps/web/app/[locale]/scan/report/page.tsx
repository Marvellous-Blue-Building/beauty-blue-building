"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ScoreRing } from "@/components/scan/ScoreRing";
import { FaceMap, SEVERITY_MARKER } from "@/components/scan/FaceMap";
import { MetricCard } from "@/components/scan/MetricCard";
import { buttonClassName } from "@/components/ui/Button";
import { useScanStore } from "@/lib/store/scan-store";
import { cn } from "@/lib/cn";
import { BAND_STYLE, METRIC_KEYS, scoreBand, type ScoreBand } from "@/lib/scan/score-bands";
import type { FlaggedZone } from "@/types/scan";

const BANDS: ScoreBand[] = ["great", "good", "fair", "needsCare"];

export default function ScanReportPage() {
  const t = useTranslations("diagnostic");
  const result = useScanStore((s) => s.result);
  const imageDataUrl = useScanStore((s) => s.imageDataUrl);
  const imageCrop = useScanStore((s) => s.imageCrop);
  const origin = useScanStore((s) => s.origin);
  const [activeArea, setActiveArea] = useState<number | null>(null);

  if (!result) {
    return (
      <ScreenContainer className="items-center justify-center gap-4 text-center">
        <h2 className="font-display text-[22px] font-semibold text-canvas-ink">
          {t("noReportTitle")}
        </h2>
        <p className="text-[12.5px] leading-relaxed text-canvas-ink-muted">
          {t("noReportSubtitle")}
        </p>
        <Link href="/scan" className={buttonClassName({ className: "block w-full" })}>
          {t("retakeScan")}
        </Link>
      </ScreenContainer>
    );
  }

  // Weekly "Recheck Your Skin" scans also continue into the (as-is)
  // questionnaire now, same as a first-time baseline scan — see
  // app/[locale]/quiz/lifestyle/page.tsx, which trims that flow's step 4
  // down to just the climate question for a check-in re-quiz. The actual
  // persistence (scan + questionnaire together) happens at the very end
  // of that flow, same place a baseline scan's does — see
  // app/[locale]/analyzing/page.tsx.
  const isCheckIn = origin === "checkin";

  const band = scoreBand(result.overall);
  const ranked = [...METRIC_KEYS].sort((a, b) => result[b] - result[a]);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const areas = result.flaggedZones ?? [];

  // Localized area text by key; reports from before scoring v2 have no key,
  // so they fall back to the analyzer's English wording.
  function areaText(zone: FlaggedZone, field: "title" | "body" | "tip"): string | null {
    const id = `areas.${zone.key}.${field}`;
    if (zone.key && t.has(id)) return t(id);
    if (field === "title") return zone.zone;
    if (field === "body") return zone.description;
    return null;
  }

  return (
    <ScreenContainer>
      <div className="mb-3 text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepLabel")}
      </div>

      {/* Overall verdict */}
      <section className="mb-5 rounded-[22px] border border-border bg-[radial-gradient(120%_100%_at_0%_0%,var(--color-mint-dim),var(--color-surface)_65%)] p-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={result.overall} />
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[10.5px] font-bold text-canvas-ink">
              <i className={cn("h-2 w-2 rounded-full", BAND_STYLE[band].dot)} />
              {t(`bands.${band}`)}
            </span>
            <h2 className="mt-2 font-display text-[19px] leading-tight font-semibold text-canvas-ink">
              {t(`verdict.${band}.title`)}
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-canvas-ink-muted">
              {t(`verdict.${band}.body`)}
            </p>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-canvas-ink shadow-[0_0_0_1px_var(--color-border)]">
            ✦ {t("strongest", { metric: t(strongest) })}
          </span>
          {scoreBand(result[weakest]) !== "great" && (
            <span className="rounded-full bg-warn-dim px-2.5 py-1 text-[11px] font-semibold text-warn">
              ◎ {t("focusOn", { metric: t(weakest) })}
            </span>
          )}
        </div>
      </section>

      {/* Face map + areas to watch */}
      <h3 className="mb-2.5 text-[12px] font-bold tracking-[0.8px] text-canvas-ink uppercase">
        {t("faceMapTitle")}
      </h3>
      <section className="mb-5 rounded-[22px] border border-border bg-surface p-4">
        <FaceMap
          zones={areas}
          imageSrc={imageDataUrl}
          imageCrop={imageCrop}
          active={activeArea}
          onSelect={(i) => setActiveArea(activeArea === i ? null : i)}
          labelFor={(zone) => areaText(zone, "title") ?? zone.zone}
        />
        {areas.length > 0 ? (
          <>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-canvas-ink-muted">
              {t("faceMapHint")}
            </p>
            <h4 className="mt-4 mb-2 text-[11.5px] font-bold tracking-[0.6px] text-canvas-ink uppercase">
              {t("areasTitle")}
            </h4>
            <ol className="flex flex-col gap-2">
              {areas.map((zone, i) => {
                const tip = areaText(zone, "tip");
                const isActive = activeArea === i;
                return (
                  <li key={`${zone.key ?? zone.zone}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setActiveArea(isActive ? null : i)}
                      aria-pressed={isActive}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition-colors",
                        isActive ? "border-primary bg-primary-dim" : "border-border bg-app-bg"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold text-surface",
                            SEVERITY_MARKER[zone.severity] ?? SEVERITY_MARKER.low
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="flex-1 text-[13px] font-bold text-canvas-ink">
                          {areaText(zone, "title")}
                        </span>
                        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-canvas-ink-muted">
                          {t(`severity.${zone.severity}`)}
                        </span>
                      </div>
                      <p className="mt-1.5 pl-[34px] text-[11.5px] leading-relaxed text-canvas-ink-muted">
                        {areaText(zone, "body")}
                      </p>
                      {tip && (
                        <p className="mt-1.5 pl-[34px] text-[11.5px] leading-relaxed text-canvas-ink">
                          <span className="font-bold">{t("tipLabel")}: </span>
                          {tip}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <div className="mt-4 text-center">
            <p className="text-[13.5px] font-bold text-canvas-ink">✓ {t("noAreasTitle")}</p>
            <p className="mt-1 text-[11.5px] text-canvas-ink-muted">{t("noAreasBody")}</p>
          </div>
        )}
      </section>

      {/* The 5 scores */}
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold tracking-[0.8px] text-canvas-ink uppercase">
          {t("scoresTitle")}
        </h3>
        <span className="text-[10.5px] text-canvas-ink-muted">{t("scaleHint")}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
        {BANDS.map((b) => (
          <span key={b} className="flex items-center gap-1 text-[10.5px] text-canvas-ink-muted">
            <i className={cn("h-2 w-2 rounded-full", BAND_STYLE[b].dot)} />
            {t(`bands.${b}`)}
          </span>
        ))}
      </div>
      {METRIC_KEYS.map((metric) => (
        <MetricCard key={metric} metric={metric} value={result[metric]} />
      ))}

      <p className="mt-2 mb-5 flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[11px] leading-relaxed text-canvas-ink-muted">
        <span aria-hidden="true">ⓘ</span>
        <span>{t("disclaimer")}</span>
      </p>

      <div className="flex-1" />

      {/* What happens next */}
      <section className="mb-3 rounded-[22px] bg-primary p-4 text-surface shadow-[0_12px_30px_-14px_rgba(166,123,107,0.7)]">
        <h3 className="font-display text-[16px] font-semibold">
          {isCheckIn ? t("checkinNextTitle") : t("nextTitle")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-surface/90">
          {isCheckIn ? t("checkinNextBody") : t("nextBody")}
        </p>
        {/* Both branches now continue into the same as-is questionnaire —
            only the label/copy above differs by origin. The actual save
            (scan + questionnaire together) happens at the end of that
            flow, not here — see app/[locale]/analyzing/page.tsx. */}
        <Link
          href="/quiz/skin-type"
          className="mt-3 block w-full rounded-[28px] bg-surface py-3 text-center text-[13.5px] font-bold text-primary"
        >
          {isCheckIn ? t("submitScan") : `${t("continueProfile")} →`}
        </Link>
      </section>
      <Link
        href={isCheckIn ? "/progress/check-in" : "/scan"}
        className={buttonClassName({ variant: "ghost", className: "block w-full" })}
      >
        {t("retakeScan")}
      </Link>
    </ScreenContainer>
  );
}
