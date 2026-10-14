/**
 * Template/keyword-based reply generator — same honesty tier as the RAG
 * routine matcher's "why" text (lib/rag/match-routine.ts, now ported to
 * services/matching-service): real rules grounded in real skincare
 * knowledge, not a fabricated claim of LLM synthesis. No LLM API is wired
 * into this app; swap this out once one is.
 */
const RULES: { pattern: RegExp; reply: string }[] = [
  {
    pattern: /retinol|retinal|tretinoin/i,
    reply:
      "Retinoids are powerful for texture and fine lines, but introduce them gradually — start 2-3 nights a week and always follow with SPF the next morning.",
  },
  {
    pattern: /acne|breakout|pimple|blemish/i,
    reply:
      "For acne-prone skin, salicylic acid and niacinamide are solid picks — they help clear pores without over-drying.",
  },
  {
    pattern: /dark spot|pigmentation|hyperpigmentation|uneven tone/i,
    reply:
      "Vitamin C and niacinamide help fade dark spots over time. Consistency and daily SPF make the biggest difference.",
  },
  {
    pattern: /dry|dehydrat/i,
    reply:
      "Hyaluronic acid and ceramides lock in moisture well — apply to damp skin for the best results.",
  },
  {
    pattern: /sensitive|irritat|redness|allerg/i,
    reply:
      "For sensitive or reactive skin, fragrance-free formulas with centella or panthenol tend to be gentler.",
  },
  {
    pattern: /sunscreen|spf|sun protection/i,
    reply: "A broad-spectrum SPF 30+ every morning is non-negotiable, even indoors or on cloudy days.",
  },
];

const FALLBACK_REPLY =
  "Thanks for sharing — I'll factor that into your routine recommendations. Feel free to ask about specific ingredients or concerns.";

export function generateBotReply(userText: string): string {
  const match = RULES.find((r) => r.pattern.test(userText));
  return match ? match.reply : FALLBACK_REPLY;
}
