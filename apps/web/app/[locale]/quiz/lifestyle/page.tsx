"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProgressTrack } from "@/components/ui/ProgressTrack";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { QuizOptionGrid } from "@/components/quiz/QuizOptionGrid";
import { BudgetSlider } from "@/components/quiz/BudgetSlider";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { buttonClassName } from "@/components/ui/Button";
import { getJSON } from "@/lib/api-client";
import { useQuizStore } from "@/lib/store/quiz-store";
import type { Climate } from "@/types/quiz";
import type { PriceRange } from "@/app/api/products/price-range/route";

const FALLBACK_RANGE: PriceRange = { min: 10000, max: 1000000 };

export default function QuizLifestylePage() {
  const t = useTranslations("quiz");
  const tc = useTranslations("common");
  const { climate, budget, ethics, setClimate, setBudget, toggleEthic } = useQuizStore();
  const [range, setRange] = useState<PriceRange>(FALLBACK_RANGE);

  useEffect(() => {
    let cancelled = false;
    getJSON<PriceRange>("/api/products/price-range").then((fetched) => {
      if (cancelled) return;
      setRange(fetched);
      const current = useQuizStore.getState().budget;
      const clamped = Math.min(Math.max(current, fetched.min), fetched.max);
      if (clamped !== current) setBudget(clamped);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenContainer>
      <div className="mb-[6px] text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepOf", { step: 4, section: t("lifestylePreferences") })}
      </div>
      <ProgressTrack percent={80} />
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("lifestyle.title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("lifestyle.subtitle")}
      </p>

      <SectionTitle>{t("lifestyle.climate")}</SectionTitle>
      <QuizOptionGrid<Climate>
        options={[
          { value: "Humid", label: t("lifestyle.climateHumid") },
          { value: "Dry/Cold", label: t("lifestyle.climateDryCold") },
        ]}
        value={climate}
        onChange={setClimate}
      />

      <SectionTitle>{t("lifestyle.monthlyBudget")}</SectionTitle>
      <BudgetSlider value={budget} onChange={setBudget} min={range.min} max={range.max} />

      <SectionTitle>{t("lifestyle.ethicalPreferences")}</SectionTitle>
      <ToggleRow
        label={t("lifestyle.veganFormulas")}
        checked={ethics.vegan}
        onChange={() => toggleEthic("vegan")}
      />
      <ToggleRow
        label={t("lifestyle.crueltyFreeOnly")}
        checked={ethics.crueltyFree}
        onChange={() => toggleEthic("crueltyFree")}
      />
      <ToggleRow
        label={t("lifestyle.fragranceFreeOnly")}
        checked={ethics.fragranceFree}
        onChange={() => toggleEthic("fragranceFree")}
      />

      <div className="flex-1" />
      <Link href="/quiz/goals" className={buttonClassName({ className: "block w-full" })}>
        {tc("continue")}
      </Link>
    </ScreenContainer>
  );
}
