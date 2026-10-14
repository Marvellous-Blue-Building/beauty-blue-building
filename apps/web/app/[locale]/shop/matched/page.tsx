"use client";

import { useEffect, useMemo } from "react";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { CatalogCard } from "@/components/product/CatalogCard";
import { getJSON } from "@/lib/api-client";
import { useRoutineStore } from "@/lib/store/routine-store";
import type { MatchedRoutine } from "@/types/routine";

export default function ShopMatchedPage() {
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
