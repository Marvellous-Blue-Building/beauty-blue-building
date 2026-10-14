"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProgressTrack } from "@/components/ui/ProgressTrack";
import { QuizChecklist } from "@/components/quiz/QuizChecklist";
import { buttonClassName } from "@/components/ui/Button";
import { useQuizStore } from "@/lib/store/quiz-store";
import type { Sensitivity } from "@/types/quiz";

const SENSITIVITIES: Sensitivity[] = [
  "Fragrance",
  "Retinoids",
  "Essential Oils",
  "Eczema-prone skin",
  "Chemical Sunscreens",
  "None of these",
];
const OPTION_KEYS: Record<Sensitivity, string> = {
  Fragrance: "fragrance",
  Retinoids: "retinoids",
  "Essential Oils": "essentialOils",
  "Eczema-prone skin": "eczema",
  "Chemical Sunscreens": "chemicalSunscreens",
  "None of these": "none",
};

export default function QuizSensitivitiesPage() {
  const t = useTranslations("quiz");
  const tc = useTranslations("common");
  const sensitivities = useQuizStore((s) => s.sensitivities);
  const toggleSensitivity = useQuizStore((s) => s.toggleSensitivity);

  return (
    <ScreenContainer>
      <div className="mb-[6px] text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepOf", { step: 3, section: t("skinProfile") })}
      </div>
      <ProgressTrack percent={60} />
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("sensitivities.title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("sensitivities.subtitle")}
      </p>
      <QuizChecklist
        options={SENSITIVITIES.map((v) => ({ value: v, label: t(`sensitivities.options.${OPTION_KEYS[v]}`) }))}
        value={sensitivities}
        onToggle={toggleSensitivity}
      />
      <div className="flex-1" />
      <div className="flex gap-2.5">
        <Link href="/quiz/lifestyle" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
          {tc("skip")}
        </Link>
        <Link href="/quiz/lifestyle" className={buttonClassName({ className: "flex-1" })}>
          {tc("continue")}
        </Link>
      </div>
    </ScreenContainer>
  );
}
