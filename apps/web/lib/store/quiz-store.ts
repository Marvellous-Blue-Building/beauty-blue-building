import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_QUIZ_ANSWERS,
  type Concern,
  type QuizAnswers,
  type Sensitivity,
} from "@/types/quiz";

interface QuizState extends QuizAnswers {
  setSkinType: (skinType: QuizAnswers["skinType"]) => void;
  toggleConcern: (concern: Concern) => void;
  toggleSensitivity: (sensitivity: Sensitivity) => void;
  setClimate: (climate: QuizAnswers["climate"]) => void;
  setBudget: (budget: number) => void;
  toggleEthic: (key: keyof QuizAnswers["ethics"]) => void;
  setGoal: (goal: QuizAnswers["goal"]) => void;
  reset: () => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_QUIZ_ANSWERS,
      setSkinType: (skinType) => set({ skinType }),
      toggleConcern: (concern) => {
        const concerns = get().concerns.includes(concern)
          ? get().concerns.filter((c) => c !== concern)
          : [...get().concerns, concern];
        set({ concerns });
      },
      toggleSensitivity: (sensitivity) => {
        const sensitivities = get().sensitivities.includes(sensitivity)
          ? get().sensitivities.filter((s) => s !== sensitivity)
          : [...get().sensitivities, sensitivity];
        set({ sensitivities });
      },
      setClimate: (climate) => set({ climate }),
      setBudget: (budget) => set({ budget }),
      toggleEthic: (key) =>
        set({ ethics: { ...get().ethics, [key]: !get().ethics[key] } }),
      setGoal: (goal) => set({ goal }),
      reset: () => set(DEFAULT_QUIZ_ANSWERS),
    }),
    {
      name: "beauty-advisor-quiz-answers",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
