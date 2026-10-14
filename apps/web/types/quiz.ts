export type SkinType =
  | "Oily"
  | "Dry"
  | "Combination"
  | "Sensitive"
  | "Normal"
  | "Not sure";

export type Concern =
  | "Acne & Breakouts"
  | "Fine Lines & Aging"
  | "Dark Spots / Hyperpigmentation"
  | "Dryness & Dehydration"
  | "Redness & Irritation"
  | "Large Pores";

export type Sensitivity =
  | "Fragrance"
  | "Retinoids"
  | "Essential Oils"
  | "Eczema-prone skin"
  | "Chemical Sunscreens"
  | "None of these";

export type Climate = "Humid" | "Dry/Cold";

export type Goal = "Clear Skin" | "Anti-Aging" | "Even Tone" | "Hydration";

export interface EthicalPreferences {
  vegan: boolean;
  crueltyFree: boolean;
  fragranceFree: boolean;
}

export interface QuizAnswers {
  skinType: SkinType | null;
  concerns: Concern[];
  sensitivities: Sensitivity[];
  climate: Climate | null;
  /** Monthly budget ceiling in Rupiah (IDR). */
  budget: number;
  ethics: EthicalPreferences;
  goal: Goal | null;
}

export const DEFAULT_QUIZ_ANSWERS: QuizAnswers = {
  skinType: null,
  concerns: [],
  sensitivities: [],
  climate: null,
  budget: 300000,
  ethics: { vegan: false, crueltyFree: false, fragranceFree: false },
  goal: null,
};
