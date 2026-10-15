"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { buttonClassName } from "@/components/ui/Button";
import { postJSON } from "@/lib/api-client";
import { useQuizStore } from "@/lib/store/quiz-store";
import { useScanStore } from "@/lib/store/scan-store";
import { useRoutineStore, markArrivedFromAnalyzing } from "@/lib/store/routine-store";
import type { MatchedRoutine } from "@/types/routine";
import type { QuizAnswers } from "@/types/quiz";

export default function AnalyzingPage() {
  const t = useTranslations("analyzing");
  const router = useRouter();
  const quiz = useQuizStore();
  const scanResult = useScanStore((s) => s.result);
  const setRoutine = useRoutineStore((s) => s.setRoutine);
  const [error, setError] = useState(false);
  const ranOnce = useRef(false);

  async function runMatch() {
    setError(false);
    try {
      const { skinType, concerns, sensitivities, climate, budget, ethics, goal } = quiz;
      const quizAnswers: QuizAnswers = {
        skinType,
        concerns,
        sensitivities,
        climate,
        budget,
        ethics,
        goal,
      };
      const routine = await postJSON<MatchedRoutine>("/api/match-routine", {
        quiz: quizAnswers,
        scan: scanResult,
        // The baseline photo is only in memory (never persisted client-side),
        // so hand it off here to be stored alongside the scan row (Day 0).
        imageBase64: useScanStore.getState().imageDataUrl,
      });
      setRoutine(routine);
      // Flag this as a real post-quiz arrival so /routine shows the product
      // recommendations to everyone — even a guest or a dead session.
      markArrivedFromAnalyzing();
      router.replace("/routine");
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // Guards against React Strict Mode's double-invoke in dev firing two
    // real DB queries for one visit.
    if (ranOnce.current) return;
    ranOnce.current = true;
    runMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenContainer className="items-center justify-center gap-[18px] text-center">
      <div className="h-[60px] w-[60px] animate-spin rounded-full border-[3px] border-surface-2 border-t-primary" />
      <div>
        <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
          {t("title")}
        </h2>
        <p className="text-[12.5px] leading-relaxed text-canvas-ink-muted">{t("subtitle")}</p>
      </div>
      {error && (
        <>
          <p className="text-[12.5px] text-warn">Couldn&apos;t reach the product database. Try again?</p>
          <button
            type="button"
            onClick={() => {
              ranOnce.current = false;
              runMatch();
            }}
            className={buttonClassName({ className: "w-full" })}
          >
            Retry
          </button>
        </>
      )}
    </ScreenContainer>
  );
}
