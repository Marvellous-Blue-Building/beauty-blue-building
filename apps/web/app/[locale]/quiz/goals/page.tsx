"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProgressTrack } from "@/components/ui/ProgressTrack";
import { QuizOptionGrid } from "@/components/quiz/QuizOptionGrid";
import { buttonClassName } from "@/components/ui/Button";
import { useQuizStore } from "@/lib/store/quiz-store";
import type { Goal } from "@/types/quiz";

const GOALS: Goal[] = ["Clear Skin", "Anti-Aging", "Even Tone", "Hydration"];
const OPTION_KEYS: Record<Goal, string> = {
  "Clear Skin": "clearSkin",
  "Anti-Aging": "antiAging",
  "Even Tone": "evenTone",
  Hydration: "hydration",
};

export default function QuizGoalsPage() {
  const t = useTranslations("quiz");
  const goal = useQuizStore((s) => s.goal);
  const setGoal = useQuizStore((s) => s.setGoal);

  return (
    <ScreenContainer>
      <div className="mb-[6px] text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepOf", { step: 5, section: t("skinProfile") })}
      </div>
      <ProgressTrack percent={100} />
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("goals.title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("goals.subtitle")}
      </p>
      <QuizOptionGrid
        options={GOALS.map((v) => ({ value: v, label: t(`goals.options.${OPTION_KEYS[v]}`) }))}
        value={goal}
        onChange={setGoal}
      />
      <div className="flex-1" />
      {goal ? (
        <Link href="/analyzing" className={buttonClassName({ className: "block w-full" })}>
          {t("goals.buildRoutine")}
        </Link>
      ) : (
        <span className={buttonClassName({ className: "block w-full", disabled: true })}>
          {t("goals.buildRoutine")}
        </span>
      )}
    </ScreenContainer>
  );
}
