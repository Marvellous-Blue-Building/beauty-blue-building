import type { Product } from "@/types/product";

/** Shape returned by the matching-service (services/matching-service) — see its POST /match-routine. */
export interface MatchedRoutineStep {
  stepNumber: number;
  why: string;
  confidence: "high" | "medium" | "low";
  product: Product;
}

export interface MatchedRoutine {
  am: MatchedRoutineStep[];
  pm: MatchedRoutineStep[];
}
