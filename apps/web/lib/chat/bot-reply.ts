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
  /** The as-is step-13 Structured Understanding Object (services/
   * matching-service POST /chat/understand's ChatUnderstanding JSON) that
   * produced this reply — persisted verbatim to chat_messages.raw_json_text
   * as the raw record for the as-is learning from real chat history.
   * Undefined when the pipeline was unreachable. */
  rawJsonText?: string;
  /** Optional navigation buttons to be displayed in the UI. */
  navButtons?: {
    label: string;
    target: string;
  }[];
}

const AI_ADVISOR_SERVICE_URL = process.env.AI_ADVISOR_SERVICE_URL;
// CPU-only Gemma generation (see services/ai-advisor/app/gemma.py) can take
// well over 20s for a 160-token reply — 60s gives it room without hanging
// the chat indefinitely.
const AI_ADVISOR_TIMEOUT_MS = 60_000;

async function generateAiAdvisorReply(
  userText: string,
  grounding: { recognizedEntities: string[]; candidateProducts: string[]; conversationContext: string[] }
): Promise<{ text: string; navButtons: { label: string; target: string }[] }> {
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
    const data = (await res.json()) as { reply: string; navButtons: { label: string; target: string }[] };
    if (!data.reply) throw new Error("ai-advisor returned an empty reply");
    return { text: data.reply, navButtons: data.navButtons ?? [] };
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
  const understanding = await callChatUnderstand(conversationId, userText, environmentalContext, userId).catch(() => null);

  // Intent detection for navigation buttons (Deterministic fallback)
  // We keep this as a safety layer because LLMs can be inconsistent.
  const navButtons: { label: string; target: string }[] = [];
  const lowerText = userText.toLowerCase();
  let textAppend = "";

  if (
    (lowerText.includes("track") && (lowerText.includes("progress") || lowerText.includes("perkembangan"))) ||
    (lowerText.includes("progres") || lowerText.includes("progress"))
  ) {
    navButtons.push({ label: "Track Your Progress", target: "progress" });
    textAppend += " [Track Your Progress]";
  }
  if (
    lowerText.includes("skin scan") ||
    lowerText.includes("scanning") ||
    lowerText.includes("analisis kulit") ||
    (lowerText.includes("cek") && lowerText.includes("kulit"))
  ) {
    navButtons.push({ label: "Skin Scanning Analysis Tool", target: "progress/check-in" });
    textAppend += " [Skin Scanning Analysis Tool]";
  }

  // Attach whatever the pipeline found whenever it found anything —
  // independent of both the reply TEXT's origin (deterministic pipeline vs.
  // Gemma below) and the classified intent. services/matching-service's
  // chat_pipeline.py only ever populates candidates when it recognized a
  // real keyword/ontology term in the user's own message (or the intent
  // itself calls for it), so trusting that gate here means any message
  // that genuinely named a need always surfaces at least its closest
  // product match, not just ones intent.py happened to bucket as
  // "product_recommendation".
  const products = understanding && understanding.candidates.length > 0 ? understanding.candidates.slice(0, 6) : undefined;
  // The exact object the pipeline returned, serialized once and carried
  // through both the deterministic and Gemma branches below — this is what
  // route.ts stores verbatim in chat_messages.raw_json_text.
  const rawJsonText = understanding ? JSON.stringify(understanding) : undefined;

  if (understanding && !understanding.isAmbiguous && understanding.reply) {
    return { text: understanding.reply + textAppend, products, rawJsonText, navButtons };
  }

  const candidateProducts = (understanding?.candidates ?? []).map((p) => `${p.name} — ${p.category}`);
  // Propagates on failure — see route.ts for how that surfaces to the user.
  const aiResponse = await generateAiAdvisorReply(userText, {
    recognizedEntities: understanding?.recognizedEntities ?? [],
    candidateProducts,
    conversationContext: understanding?.conversationContext ?? [],
  });

  return { 
    text: aiResponse.text + textAppend, 
    products, 
    rawJsonText, 
    navButtons: [...navButtons, ...aiResponse.navButtons] 
  };
}
