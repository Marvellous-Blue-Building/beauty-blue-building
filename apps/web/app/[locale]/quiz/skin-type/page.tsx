"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProgressTrack } from "@/components/ui/ProgressTrack";
import { QuizOptionGrid } from "@/components/quiz/QuizOptionGrid";
import { buttonClassName } from "@/components/ui/Button";
import { useQuizStore } from "@/lib/store/quiz-store";
import type { SkinType } from "@/types/quiz";

const SKIN_TYPES: SkinType[] = ["Oily", "Dry", "Combination", "Sensitive", "Normal", "Not sure"];
const OPTION_KEYS: Record<SkinType, string> = {
  Oily: "oily",
  Dry: "dry",
  Combination: "combination",
  Sensitive: "sensitive",
  Normal: "normal",
  "Not sure": "notSure",
};

export default function QuizSkinTypePage() {
  const t = useTranslations("quiz");
  const tc = useTranslations("common");
  const skinType = useQuizStore((s) => s.skinType);
  const setSkinType = useQuizStore((s) => s.setSkinType);

  return (
    <ScreenContainer>
      <div className="mb-[6px] text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepOf", { step: 1, section: t("skinProfile") })}
      </div>
      <ProgressTrack percent={20} />
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("skinType.title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("skinType.subtitle")}
      </p>
      <QuizOptionGrid
        options={SKIN_TYPES.map((v) => ({ value: v, label: t(`skinType.options.${OPTION_KEYS[v]}`) }))}
        value={skinType}
        onChange={setSkinType}
      />
      <div className="flex-1" />
      {skinType ? (
        <Link href="/quiz/concerns" className={buttonClassName({ className: "block w-full" })}>
          {tc("continue")}
        </Link>
      ) : (
        <span className={buttonClassName({ className: "block w-full", disabled: true })}>
          {tc("continue")}
        </span>
      )}
    </ScreenContainer>
  );
}
