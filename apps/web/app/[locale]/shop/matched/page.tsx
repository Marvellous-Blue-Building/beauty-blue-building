"use client";

import { useEffect, useMemo } from "react";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { CatalogCard } from "@/components/product/CatalogCard";
import { getJSON } from "@/lib/api-client";
import { useRoutineStore } from "@/lib/store/routine-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import type { MatchedRoutine } from "@/types/routine";

export default function ShopMatchedPage() {
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const routine = useRoutineStore((s) => s.routine);
  const setRoutine = useRoutineStore((s) => s.setRoutine);

  useEffect(() => {
    // Falls back to the server's cached last-computed routine (backed by
    // the real products table) if the client store is empty.
    if (!routine) {
      getJSON<MatchedRoutine | null>("/api/routine").then((r) => {
        if (r) setRoutine(r);
      });
    }
  }, [routine, setRoutine]);

  const matched = useMemo(
    () => (routine ? [...routine.am, ...routine.pm].map((s) => s.product) : []),
    [routine]
  );

  if (authLoaded && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={fetchUser}
      />
    );
  }

  return (
    <ScreenContainer>
      <p className="mb-4 text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {matched.length} products matched to your quiz answers and skin scan.
      </p>
      {matched.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">
          No matches yet — take the quiz to get products matched to your skin.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-[10px]">
          {matched.map((p) => (
            <CatalogCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </ScreenContainer>
  );
}
