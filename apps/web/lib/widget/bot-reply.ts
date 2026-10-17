/**
 * Guest-widget chat orchestration — same two-stage pipeline as
 * lib/chat/bot-reply.ts (matching-service's deterministic understanding
 * first, ai-advisor's Gemma fallback only when ambiguous), minus the
 * authenticated-user-only inputs (no environmental context lookup, no
 * per-user chat/scan history personalization) since a widget visitor has
 * no `users` row. The visitor's own widget beauty scan stands in for it:
 * its result grounds the reply and nudges ranking, and questions the scan
 * itself answers ("lipstik yang cocok?", "bentuk wajahku apa?") are
 * answered from it directly (see lib/widget/beauty-scan.ts).
 */
import type { Product } from "@/types/product";
import { pool } from "@/lib/db";
import { callChatUnderstand } from "@/lib/matching-client";
import { toProduct, type ProductRow } from "@/lib/rag/product-row";
import { getActiveTenantBoostKeywords } from "@/lib/tenant-boosts";
import {
  answerFromBeautyScan,
  beautyScanBoostKeywords,
  beautyScanGuidance,
  getLatestWidgetBeautyScan,
  type WidgetLanguage,
} from "@/lib/widget/beauty-scan";

export interface WidgetBotReply {
  text: string;
  products?: Product[];
  rawJsonText?: string;
}

const AI_ADVISOR_SERVICE_URL = process.env.AI_ADVISOR_SERVICE_URL;
// CPU-only Gemma generation (see services/ai-advisor/app/gemma.py) can take
// well over 20s for a 160-token reply — 60s gives it room without hanging
// the widget indefinitely.
const AI_ADVISOR_TIMEOUT_MS = 60_000;

async function generateAiAdvisorReply(userText: string, grounding: {
  recognizedEntities: string[];
  candidateProducts: string[];
  conversationContext: string[];
}, language: WidgetLanguage): Promise<string> {
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
        language,
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

/** Exact catalog rows, in the given order (closest shade first). */
async function productsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<ProductRow>(
    `SELECT *,
       (SELECT count(*) FROM products p2 WHERE p2.parent_sku = products.parent_sku) AS variant_count,
       (SELECT array_agg(DISTINCT p3.color_variant) FROM products p3
         WHERE p3.parent_sku = products.parent_sku AND p3.color_variant IS NOT NULL AND p3.stock_quantity > 0) AS color_palette
     FROM products WHERE id = ANY($1)`,
    [ids]
  );
  const byId = new Map(rows.map((row) => [row.id, toProduct(row)]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
}

export async function generateWidgetBotReply(
  conversationId: string,
  userText: string,
  sessionId?: string,
  /** The widget's page language — every reply source answers in it (default Indonesian). */
  language: WidgetLanguage = "id"
): Promise<WidgetBotReply> {
  const [tenantBoosts, scan] = await Promise.all([
    getActiveTenantBoostKeywords().catch(() => [] as string[]),
    sessionId ? getLatestWidgetBeautyScan(sessionId).catch(() => null) : Promise.resolve(null),
  ]);

  if (scan) {
    const direct = answerFromBeautyScan(userText, scan, language);
    if (direct) {
      const products = await productsByIds(direct.productIds).catch(() => []);
      return {
        text: direct.text,
        products: products.length > 0 ? products : undefined,
        rawJsonText: JSON.stringify({ source: "widget_beauty_scan", scanId: scan.scanId, productIds: direct.productIds }),
      };
    }
  }

  const boostKeywords = [...tenantBoosts, ...(scan ? beautyScanBoostKeywords(scan) : [])];
  const guidanceText = scan ? beautyScanGuidance(scan) : "";
  const context = boostKeywords.length > 0 || guidanceText ? { guidanceText, boostKeywords } : null;
  const understanding = await callChatUnderstand(conversationId, userText, context, null, language).catch(() => null);

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
  }, language);

  return { text, products, rawJsonText };
}
