/**
 * Chat reply orchestration — runs the real 14-stage hybrid pipeline from
 * docs/plan.md SS4:
 *
 *   1. services/matching-service's POST /chat/understand runs steps 1-13
 *      (normalization, dictionary/fuzzy/entity matching, intent
 *      classification, FTS/trigram/pgvector retrieval, conversation-state
 *      resolution, confidence/ambiguity scoring) and composes a
 *      deterministic reply when it isn't ambiguous.
 *   2. Only when that pipeline is genuinely ambiguous (or unreachable) does
 *      this fall through to services/ai-advisor's Gemma call (step 14),
 *      grounded in whatever entities/candidates/context step 1 did
 *      recognize — not a blind call on the raw message.
 *
 * There is no scripted "engagement" fallback text here on purpose — a
 * reply is either the pipeline's real deterministic answer or Gemma's
 * real generated text. If Gemma genuinely can't be reached, that's
 * surfaced as a real error (see route.ts) rather than disguised as a
 * reply that pretends to have understood the message.
 *
 * The agent always responds in Bahasa Indonesia — the deterministic reply
 * text (services/matching-service's INGREDIENT_FACTS / templates) and
 * Gemma's SYSTEM_PROMPT are both Indonesian-only, independent of the
 * app's own UI locale setting.
 */
import type { Product } from "@/types/product";
import { callChatUnderstand } from "@/lib/matching-client";
import { getEnvironmentalContext } from "@/lib/geotagging-weather-client";

export interface BotReply {
  text: string;
  /** Up to 6 closest-matching products — rendered as a full-width list
   * below the bubble (see ChatProductList) when the pipeline found what
   * the user was looking for. */
  products?: Product[];
}

const AI_ADVISOR_SERVICE_URL = process.env.AI_ADVISOR_SERVICE_URL;
const AI_ADVISOR_TIMEOUT_MS = 20_000;

async function generateAiAdvisorReply(
  userText: string,
  grounding: { recognizedEntities: string[]; candidateProducts: string[]; conversationContext: string[] }
): Promise<string> {
  if (!AI_ADVISOR_SERVICE_URL) {
    throw new Error("AI_ADVISOR_SERVICE_URL is not configured");
  }

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
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ai-advisor responded with ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as { reply: string };
    if (!data.reply) throw new Error("ai-advisor returned an empty reply");
    return data.reply;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateBotReply(
  conversationId: string | null,
  userText: string,
  userId: string
): Promise<BotReply> {
  const environmentalContext = await getEnvironmentalContext(userId).catch(() => null);
  const understanding = await callChatUnderstand(conversationId, userText, environmentalContext).catch(() => null);

  // Whenever the user is asking for a product, always attach whatever the
  // pipeline found — independent of whether the reply TEXT itself came
  // from the deterministic pipeline or Gemma below. A product request
  // should never end up with zero products just because confidence was
  // borderline enough to defer the text to Gemma.
  const products =
    understanding?.intent === "product_recommendation" && understanding.candidates.length > 0
      ? understanding.candidates.slice(0, 6)
      : undefined;

  if (understanding && !understanding.isAmbiguous && understanding.reply) {
    return { text: understanding.reply, products };
  }

  const candidateProducts = (understanding?.candidates ?? []).map((p) => `${p.name} — ${p.category}`);
  // Propagates on failure — see route.ts for how that surfaces to the user.
  const aiReply = await generateAiAdvisorReply(userText, {
    recognizedEntities: understanding?.recognizedEntities ?? [],
    candidateProducts,
    conversationContext: understanding?.conversationContext ?? [],
  });

  return { text: aiReply, products };
}
