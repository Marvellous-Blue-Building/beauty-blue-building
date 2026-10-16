/**
 * Sentiment — Phase 3 "sentiment dan tren" deliverable (see Knowledge Base
 * Sistem Analitik Forecasting & Marketing Beauty.md, Fase 3 langkah 4),
 * scoped to what this project actually has: real visitor chat text
 * (`chat_messages`/`widget_messages`), not marketplace reviews (no review
 * table exists) and not social media (no API integration exists).
 *
 * This is a small ID+EN keyword lexicon, not a trained NLP model — no
 * sentiment classifier exists anywhere else in this repo (verified by
 * exploring both the Next.js app and all 4 Python services). Keyword
 * matching is a real, deterministic, inspectable method; it is not a
 * fabricated score, but it is also not claimed to be as accurate as a
 * trained classifier would be — exactly the same honesty trade-off this
 * section already makes for forecasting and uplift.
 */

// "rekomen"/"recommended" were deliberately dropped: this app's chat is
// built around visitors ASKING for recommendations ("rekomendasi serum
// untuk..."), so those words hit on nearly every neutral request, not
// just genuine endorsements — caught by sampling real chat text before
// shipping. Only phrases that read as endorsement, not request, are kept.
const POSITIVE_WORDS = [
  "bagus banget", "suka banget", "cocok banget", "cocok di kulit", "oke banget",
  "mantap", "puas", "sangat membantu", "sangat recommended", "recommended banget",
  "highly recommend", "worth it", "jadi glowing", "kulit jadi lembut",
  "kulit jadi halus", "kulit jadi cerah", "membaik", "sembuh", "nyaman dipakai",
  "love it", "so good", "great product", "amazing", "perfect", "best product",
  "sangat cantik", "wangi banget", "awet seharian",
];

// Deliberately excludes bare skin-condition nouns ("jerawat", "kering",
// "berminyak", "kusam") — this app's real chat traffic is dominated by
// visitors describing their skin to ASK for a recommendation ("cari salep
// jerawat", "kulit saya kering"), not reacting to one they've used. Those
// words alone are topic words, not sentiment, confirmed by sampling real
// widget_messages/chat_messages text before shipping this lexicon. Only
// words/phrases that are negative regardless of what they're attached to
// are listed here.
const NEGATIVE_WORDS = [
  "jelek", "kecewa", "bikin breakout", "nyebabin jerawat", "iritasi",
  "alergi", "gatal-gatal", "perih", "lengket banget", "mahal banget",
  "lama banget", "lambat", "rusak", "bau", "bad", "terrible", "worst",
  "disappointed", "allergic", "irritat", "awful", "nyesel", "kapok",
  "nggak cocok", "ga cocok", "tidak cocok", "gak worth it",
];

export interface SentimentResult {
  label: "positive" | "negative" | "neutral";
  /** positive hits − negative hits (not normalized by length — short chat messages, not documents). */
  score: number;
}

export function classifySentiment(text: string | null | undefined): SentimentResult {
  if (!text) return { label: "neutral", score: 0 };
  const lower = text.toLowerCase();

  let score = 0;
  for (const word of POSITIVE_WORDS) if (lower.includes(word)) score += 1;
  for (const word of NEGATIVE_WORDS) if (lower.includes(word)) score -= 1;

  const label: SentimentResult["label"] = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  return { label, score };
}
