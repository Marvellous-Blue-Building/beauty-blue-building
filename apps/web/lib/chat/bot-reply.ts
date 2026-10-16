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
const AI_ADVISOR_TIMEOUT_MS = 20_000;

async function detectNavIntent(userText: string): Promise<{ label: string; target: string }[]> {
  if (!AI_ADVISOR_SERVICE_URL) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_ADVISOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_ADVISOR_SERVICE_URL}/detect-nav-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`detectNavIntent: ai-advisor /detect-nav-intent responded with ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { navButtons: { label: string; target: string }[] };
    return data.navButtons ?? [];
  } catch (err) {
    console.error("detectNavIntent: ai-advisor unreachable:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAiAdvisorReply(
  userText: string,
  grounding: { recognizedEntities: string[]; candidateProducts: string[]; conversationContext: string[] }
): Promise<{ text: string }> {
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
    return { text: data.reply };
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
    // Deterministic branch: no Gemma call happens here, so nav intent is
    // classified by services/ai-advisor's /detect-nav-intent (the same real
    // SkinAnalysisIntentDetector used for the fallback branch's tags) rather
    // than a hardcoded keyword check — fails open (no buttons) if the
    // service is unreachable. The "[Label]" suffix is appended to the stored
    // text (not just returned as navButtons) because conversations/[id]/
    // route.ts reconstructs navButtons for reloaded history by re-parsing
    // that stored text — the same convention Gemma's own tagged output
    // already relies on for the fallback branch below.
    const navButtons = await detectNavIntent(userText);
    const textAppend = navButtons.map((btn) => ` [${btn.label}]`).join("");
    return { text: understanding.reply + textAppend, products, rawJsonText, navButtons };
  }

  const candidateProducts = (understanding?.candidates ?? []).map((p) => `${p.name} — ${p.category}`);
  // Propagates on failure — see route.ts for how that surfaces to the user.
  // /detect-nav-intent (the same real detector used by the deterministic
  // branch above) is the single source of truth for nav buttons here too.
  // Gemma used to self-tag its own reply with "[Label]" markers, but it sees
  // conversationContext (recent turns) alongside the current message, so it
  // could tag based on something mentioned earlier in the conversation
  // rather than the message actually being replied to — gemma.py no longer
  // does this; nav intent is decided purely from the current userText.
  const [aiResponse, navButtons] = await Promise.all([
    generateAiAdvisorReply(userText, {
      recognizedEntities: understanding?.recognizedEntities ?? [],
      candidateProducts,
      conversationContext: understanding?.conversationContext ?? [],
    }),
    detectNavIntent(userText),
  ]);
  const textAppend = navButtons.map((btn) => ` [${btn.label}]`).join("");

  return {
    text: aiResponse.text + textAppend,
    products,
    rawJsonText,
    navButtons,
  };
}
