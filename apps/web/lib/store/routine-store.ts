import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MatchedRoutine } from "@/types/routine";

// Session-scoped handoff flag between /analyzing and /routine. Stored
// separately from the persisted routine itself because it answers a
// different question — "how did we get here?" — needed to distinguish a
// real post-quiz arrival (show the routine to everyone, signed in or not)
// from a direct visit while a previously-signed-in session has died (show
// the sign-in gate). Kept explicitly "true"/"false" rather than present/
// absent so every read is unambiguous.
const FROM_ANALYZING_KEY = "beauty-advisor-from-analyzing";

/** Marks the next /routine visit as arriving from /analyzing. Called by the
 * analyzing screen just before it redirects. */
export function markArrivedFromAnalyzing(): void {
  if (typeof window !== "undefined") sessionStorage.setItem(FROM_ANALYZING_KEY, "true");
}

/** Reads the handoff flag and resets it to "false" so any later visit to
 * /routine is treated as a direct one. */
export function consumeArrivedFromAnalyzing(): boolean {
  if (typeof window === "undefined") return false;
  const arrived = sessionStorage.getItem(FROM_ANALYZING_KEY) === "true";
  sessionStorage.setItem(FROM_ANALYZING_KEY, "false");
  return arrived;
}

interface RoutineState {
  routine: MatchedRoutine | null;
  setRoutine: (routine: MatchedRoutine) => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set) => ({
      routine: null,
      setRoutine: (routine: MatchedRoutine) => set({ routine }),
    }),
    {
      name: "beauty-advisor-routine",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
