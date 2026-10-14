"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { SegmentControl } from "@/components/ui/SegmentControl";
import { RoutineCard } from "@/components/routine/RoutineCard";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { Pill } from "@/components/ui/Pill";
import { buttonClassName } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getJSON, postJSON } from "@/lib/api-client";
import { isQuestionnaireComplete, isScanComplete } from "@/lib/onboarding-complete";
import { useQuizStore } from "@/lib/store/quiz-store";
import { useScanStore } from "@/lib/store/scan-store";
import { useRoutineStore } from "@/lib/store/routine-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useCartStore } from "@/lib/store/cart-store";
import { useSavedStore } from "@/lib/store/saved-store";
import type { MatchedRoutine } from "@/types/routine";
import type { QuizAnswers } from "@/types/quiz";

type Period = "am" | "pm";

export default function RoutinePage() {
  const t = useTranslations("routine");
  const [period, setPeriod] = useState<Period>("am");
  const { skinType, concerns, ethics } = useQuizStore();
  const routine = useRoutineStore((s) => s.routine);
  const setRoutine = useRoutineStore((s) => s.setRoutine);
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchSaved = useSavedStore((s) => s.fetchSaved);
  const isGuest = authLoaded && !user;

  useEffect(() => {
    // Falls back to the server's cached last-computed routine if the
    // client store is empty (e.g. a hard refresh cleared sessionStorage).
    if (!routine) {
      getJSON<MatchedRoutine | null>("/api/routine").then((r) => {
        if (r) setRoutine(r);
      });
    }
  }, [routine, setRoutine]);

  const preference = ethics.vegan ? "Vegan Only" : ethics.crueltyFree ? "Cruelty-Free" : "No preference";

  return (
    <ScreenContainer>
      <Pill className="mb-3 self-start">
        {t("profileSummary", {
          skinType: skinType ?? "Combination",
          concern: concerns[0] ?? "Acne-Prone",
          preference,
        })}
      </Pill>
      <SegmentControl
        options={[
          { value: "am", label: `☀ ${t("am")}` },
          { value: "pm", label: `🌙 ${t("pm")}` },
        ]}
        value={period}
        onChange={setPeriod}
      />
      {routine?.[period].map((step) => (
        <RoutineCard key={`${period}-${step.stepNumber}`} step={step} clickable={!isGuest} />
      ))}
      {!routine && (
        <p className="mb-4 text-[12.5px] text-text-muted">
          No routine yet — take the quiz to get one built from the real catalog.
        </p>
      )}
      <DisclaimerBanner>{t("disclaimer")}</DisclaimerBanner>
      <div className="flex-1" />
      {isGuest ? (
        <GoogleSignInButton
          className={buttonClassName({ className: "block w-full" })}
          onSignedIn={async () => {
            await fetchUser();
            await Promise.all([fetchCart(), fetchSaved()]);
            // A guest's questionnaire/scan stay client-side (sessionStorage)
            // during the whole guest journey — nothing is written to the DB.
            // Only now, after Google sign-in actually created a session, do we
            // re-POST the same answers so they're finally attached to the new
            // account's email. Guard on a real session first (registration may
            // not have completed) and only when onboarding is genuinely
            // complete: a finished scan AND all required questionnaire answers.
            // A partial onboarding (or a scan-less guest) writes nothing.
            const signedInUser = useAuthStore.getState().user;
            if (!signedInUser) return;
            const { skinType, concerns, sensitivities, climate, budget, ethics, goal } =
              useQuizStore.getState();
            const quiz: QuizAnswers = { skinType, concerns, sensitivities, climate, budget, ethics, goal };
            const scan = useScanStore.getState().result;
            if (!isScanComplete(scan) || !isQuestionnaireComplete(quiz)) return;
            try {
              await postJSON("/api/match-routine", {
                quiz,
                scan,
                imageBase64: useScanStore.getState().imageDataUrl,
              });
            } catch (error) {
              console.error("Failed to attach onboarding data after sign-in:", error);
            }
          }}
        >
          Sign in with Google to Access More
        </GoogleSignInButton>
      ) : (
        <div className="flex gap-2.5">
          <Link href="/shop" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
            {t("shopProducts")}
          </Link>
          <Link href="/chat" className={buttonClassName({ className: "flex-1" })}>
            {t("askAdvisor")}
          </Link>
        </div>
      )}
    </ScreenContainer>
  );
}
