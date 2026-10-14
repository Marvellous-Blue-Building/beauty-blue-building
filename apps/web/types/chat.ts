import type { Product } from "@/types/product";

export type ChatRole = "bot" | "user";

export type ChatIntent = "product_recommendation" | "ingredient_inquiry" | "routine_advice" | "general_question";

/** Structured Understanding Object returned by services/matching-service's
 * POST /chat/understand — docs/plan.md SS4 step 13. */
export interface ChatUnderstanding {
  normalizedText: string;
  recognizedEntities: string[];
  intent: ChatIntent;
  confidence: "high" | "medium" | "low";
  isAmbiguous: boolean;
  reply: string | null;
  topCandidate: Product | null;
  /** Up to 6 closest-ranked items — rendered as a full-width product list
   * below the bot bubble when present (see ChatProductList). */
  candidates: Product[];
  conversationContext: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text?: string;
  imageColor?: string;
  /** Up to 6 closest-matching products for this reply, shown full-width
   * below the bubble (see ChatProductList). */
  products?: Product[];
  createdAt: string;
  /** Client-only: a bot bubble shown while waiting for the real reply (bouncing-dots UI). Never persisted. */
  pending?: boolean;
}

/** Row in the Conversation History list. */
export interface ConversationSummary {
  id: string;
  title: string;
  preview: string | null;
  updatedAt: string;
}

/** Full transcript for one conversation (used by both the live /chat screen and the history detail screen). */
export interface ConversationDetail {
  id: string;
  title: string;
  messages: ChatMessage[];
}
