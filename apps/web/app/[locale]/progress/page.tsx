"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { DayPhotoCards } from "@/components/progress/DayPhotoCards";
import { MetricBar } from "@/components/scan/MetricBar";
import { buttonClassName } from "@/components/ui/Button";
import { getJSON } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth-store";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import type { ProgressSnapshot } from "@/types/progress";

export default function ProgressPage() {
  const t = useTranslations("progress");
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [snapshots, setSnapshots] = useState<ProgressSnapshot[] | null>(null);
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => {
    getJSON<ProgressSnapshot[]>("/api/progress").then(setSnapshots);
  }, []);

  if (authLoaded && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={fetchUser}
      />
    );
  }

  if (!snapshots) return null;

  const active = snapshots.find((s) => s.day === activeDay) ?? snapshots[0];
  const baseline = snapshots[0];

  function metricDisplay(baselineValue: number | null, activeValue: number | null) {
    if (baselineValue == null || activeValue == null) return "No data yet";
    const arrow = activeValue >= baselineValue ? "▲" : "▼";
    return `${Math.round(baselineValue)} → ${Math.round(activeValue)} ${arrow}`;
  }

  return (
    <ScreenContainer>
      <div className="mb-2 text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepLabel")}
      </div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px] font-semibold text-canvas-ink">
          {t("title")}
        </h2>
        <Link
          href="/progress/history"
          className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-bold whitespace-nowrap text-canvas-ink"
        >
          {t("seeAll")}
        </Link>
      </div>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("subtitle")}
      </p>
      <DayPhotoCards snapshots={snapshots} activeDay={activeDay} onSelect={setActiveDay} />
      <MetricBar
        label="Hydration"
        value={active.hydration ?? 0}
        displayValue={metricDisplay(baseline.hydration, active.hydration)}
      />
      <MetricBar
        label="Texture"
        value={active.texture ?? 0}
        displayValue={metricDisplay(baseline.texture, active.texture)}
      />
      <MetricBar
        label="Pigmentation"
        value={active.pigmentation ?? 0}
        displayValue={metricDisplay(baseline.pigmentation, active.pigmentation)}
      />
      <Link
        href="/progress/check-in"
        className="mb-[18px] block rounded-2xl border border-dashed border-border px-5 py-5 text-center text-[12.5px] font-semibold text-canvas-ink-muted"
      >
        {t("uploadCheckIn")}
      </Link>
      <div className="flex-1" />
      <Link href="/chat" className={buttonClassName({ className: "block w-full" })}>
        {t("askAboutProgress")}
      </Link>
    </ScreenContainer>
  );
}
