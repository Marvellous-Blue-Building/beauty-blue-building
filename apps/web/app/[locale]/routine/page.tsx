"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { SegmentControl } from "@/components/ui/SegmentControl";
import { RoutineCard } from "@/components/routine/RoutineCard";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { Pill } from "@/components/ui/Pill";
import { buttonClassName } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import { getJSON, postJSON } from "@/lib/api-client";
import { isQuestionnaireComplete, isScanComplete } from "@/lib/onboarding-complete";
import { useQuizStore } from "@/lib/store/quiz-store";
import { useScanStore } from "@/lib/store/scan-store";
import { useRoutineStore, consumeArrivedFromAnalyzing } from "@/lib/store/routine-store";
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

  // null = haven't read the sessionStorage handoff flag yet. Guards the
  // double-invoke of effects under React Strict Mode in dev so the flag
  // isn't consumed (and reset to "false") before it's actually used.
  const [fromAnalyzing, setFromAnalyzing] = useState<boolean | null>(null);
  const consumedFlag = useRef(false);

  useEffect(() => {
    if (consumedFlag.current) return;
    consumedFlag.current = true;
    setFromAnalyzing(consumeArrivedFromAnalyzing());
  }, []);

  useEffect(() => {
    // Falls back to the server's cached last-computed routine if the
    // client store is empty (e.g. a hard refresh cleared sessionStorage).
    if (!routine) {
      getJSON<MatchedRoutine | null>("/api/routine").then((r) => {
        if (r) setRoutine(r);
      });
    }
  }, [routine, setRoutine]);

  async function handleSignedIn() {
    await fetchUser();
    await Promise.all([fetchCart(), fetchSaved()]);
    const signedInUser = useAuthStore.getState().user;
    if (!signedInUser) return;
    const { skinType, concerns, sensitivities, climate, budget, ethics, goal } =
      useQuizStore.getState();
    const quiz: QuizAnswers = { skinType, concerns, sensitivities, climate, budget, ethics, goal };
    const scan = useScanStore.getState().result;
    if (isScanComplete(scan) && isQuestionnaireComplete(quiz)) {
      try {
        const matched = await postJSON<MatchedRoutine>("/api/match-routine", {
          quiz,
          scan,
          imageBase64: useScanStore.getState().imageDataUrl,
        });
        setRoutine(matched);
        return;
      } catch (error) {
        console.error("Failed to attach onboarding data after sign-in:", error);
      }
    }
    // No local onboarding data to attach (e.g. a returning user whose
    // session had died) — pull whatever the account already has persisted.
    const existing = await getJSON<MatchedRoutine | null>("/api/routine").catch(() => null);
    if (existing) setRoutine(existing);
  }

  // Wait for both the handoff flag and the session to resolve before
  // choosing a layout, so an expired session never flashes the routine
  // list (or vice versa) for a frame.
  if (fromAnalyzing === null || !authLoaded) return null;

  // Direct visit (not the post-quiz arrival) without a real session — an
  // expired session or a plain guest. The routine is genuinely account-tied,
  // so gate it exactly the way Profile does (Profile's own /api/profile call
  // 401s for any unauthenticated visitor, not just an expired one). The
  // post-quiz arrival above is the one exception, so a guest who just
  // finished onboarding still sees the recommendations.
  if (!fromAnalyzing && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your routine"
        subtitle="Your routine is tied to your account."
        onSignedIn={handleSignedIn}
      />
    );
  }

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
          onSignedIn={handleSignedIn}
        >
          Sign in with Google to Access More
        </GoogleSignInButton>
      ) : (
        <div className="flex gap-2.5">
          <Link href="/shop" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
            {t("shopProducts")}
          </Link>
          <Link href="/chat" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
            {t("askAdvisor")}
          </Link>
        </div>
      )}
    </ScreenContainer>
  );
}
