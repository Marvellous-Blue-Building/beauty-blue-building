import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MatchedRoutine } from "@/types/routine";

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
