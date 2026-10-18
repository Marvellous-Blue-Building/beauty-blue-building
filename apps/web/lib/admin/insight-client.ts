const AI_ADVISOR_SERVICE_URL = process.env.AI_ADVISOR_SERVICE_URL;
const INSIGHT_TIMEOUT_MS = 60_000;

/** Calls services/ai-advisor's /insight (Vera Intelligence) — the admin
 * dashboard's analytics chat, distinct from the shopper-facing /advise. */
export async function generateInsightReply(
  message: string,
  dataContext: string,
  conversationContext: string[] = []
): Promise<string> {
  if (!AI_ADVISOR_SERVICE_URL) {
    throw new Error("AI_ADVISOR_SERVICE_URL is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_ADVISOR_SERVICE_URL}/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, dataContext, conversationContext }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ai-advisor /insight responded with ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as { reply: string };
    return data.reply;
  } finally {
    clearTimeout(timeout);
  }
}
