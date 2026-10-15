/**
 * Guest-widget chat orchestration — same two-stage pipeline as
 * lib/chat/bot-reply.ts (matching-service's deterministic understanding
 * first, ai-advisor's Gemma fallback only when ambiguous), minus the
 * authenticated-user-only inputs (no environmental context lookup, no
 * per-user chat/scan history personalization) since a widget visitor has
 * no `users` row. That personalization gap is a known, accepted v1
 * simplification — see the Phase 1 plan.
 */
import type { Product } from "@/types/product";
import { callChatUnderstand } from "@/lib/matching-client";

export interface WidgetBotReply {
  text: string;
  products?: Product[];
  rawJsonText?: string;
}

const AI_ADVISOR_SERVICE_URL = process.env.AI_ADVISOR_SERVICE_URL;
const AI_ADVISOR_TIMEOUT_MS = 20_000;

async function generateAiAdvisorReply(userText: string, grounding: {
  recognizedEntities: string[];
  candidateProducts: string[];
  conversationContext: string[];
}): Promise<string> {
  if (!AI_ADVISOR_SERVICE_URL) throw new Error("AI_ADVISOR_SERVICE_URL is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_ADVISOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_ADVISOR_SERVICE_URL}/advise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        recognizedEntities: grounding.recognizedEntities,
        candidateProducts: grounding.candidateProducts,
        conversationContext: grounding.conversationContext,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ai-advisor responded with ${res.status}`);
    const data = (await res.json()) as { reply: string };
    if (!data.reply) throw new Error("ai-advisor returned an empty reply");
    return data.reply;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateWidgetBotReply(conversationId: string, userText: string): Promise<WidgetBotReply> {
  const understanding = await callChatUnderstand(conversationId, userText, null, null).catch(() => null);

  const products = understanding && understanding.candidates.length > 0 ? understanding.candidates.slice(0, 6) : undefined;
  const rawJsonText = understanding ? JSON.stringify(understanding) : undefined;

  if (understanding && !understanding.isAmbiguous && understanding.reply) {
    return { text: understanding.reply, products, rawJsonText };
  }

  const candidateProducts = (understanding?.candidates ?? []).map((p) => `${p.name} — ${p.category}`);
  const text = await generateAiAdvisorReply(userText, {
    recognizedEntities: understanding?.recognizedEntities ?? [],
    candidateProducts,
    conversationContext: understanding?.conversationContext ?? [],
  });

  return { text, products, rawJsonText };
}
