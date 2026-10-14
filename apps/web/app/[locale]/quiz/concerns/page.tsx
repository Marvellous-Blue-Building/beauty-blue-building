"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProgressTrack } from "@/components/ui/ProgressTrack";
import { QuizChecklist } from "@/components/quiz/QuizChecklist";
import { buttonClassName } from "@/components/ui/Button";
import { useQuizStore } from "@/lib/store/quiz-store";
import type { Concern } from "@/types/quiz";

const CONCERNS: Concern[] = [
  "Acne & Breakouts",
  "Fine Lines & Aging",
  "Dark Spots / Hyperpigmentation",
  "Dryness & Dehydration",
  "Redness & Irritation",
  "Large Pores",
];
const OPTION_KEYS: Record<Concern, string> = {
  "Acne & Breakouts": "acne",
  "Fine Lines & Aging": "aging",
  "Dark Spots / Hyperpigmentation": "darkSpots",
  "Dryness & Dehydration": "dryness",
  "Redness & Irritation": "redness",
  "Large Pores": "pores",
};

export default function QuizConcernsPage() {
  const t = useTranslations("quiz");
  const tc = useTranslations("common");
  const concerns = useQuizStore((s) => s.concerns);
  const toggleConcern = useQuizStore((s) => s.toggleConcern);

  return (
    <ScreenContainer>
      <div className="mb-[6px] text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepOf", { step: 2, section: t("skinProfile") })}
      </div>
      <ProgressTrack percent={40} />
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("concerns.title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("concerns.subtitle")}
      </p>
      <QuizChecklist
        options={CONCERNS.map((v) => ({ value: v, label: t(`concerns.options.${OPTION_KEYS[v]}`) }))}
        value={concerns}
        onToggle={toggleConcern}
      />
      <div className="flex-1" />
      {concerns.length > 0 ? (
        <Link href="/quiz/sensitivities" className={buttonClassName({ className: "block w-full" })}>
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
