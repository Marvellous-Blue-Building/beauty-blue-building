export type ChatRole = "bot" | "user";

export interface ChatRecommendation {
  productId: string;
  badge: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text?: string;
  imageColor?: string;
  recommendation?: ChatRecommendation;
  createdAt: string;
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
