import { NextRequest } from "next/server";
import { getOrCreateWidgetConversation, saveWidgetMessage, touchWidgetSession } from "@/lib/widget/session";
import { generateWidgetBotReply } from "@/lib/widget/bot-reply";
import type { Product } from "@/types/product";

/**
 * POST /api/widget/chat — the guest-facing mirror of /api/chat/messages.
 * Body is sent as `Content-Type: text/plain` (a CORS-safelisted content
 * type) carrying a JSON string `{message, conversationId, sessionId}` —
 * keeping the cross-origin POST a "simple request" with no preflight, same
 * trick the Ganes widget uses. sessionId travels in the body rather than a
 * custom header for the same reason: a custom header would force a
 * preflight.
 *
 * Streams Server-Sent Events: `start` (gives conversationId) then one
 * `done` frame (answer + products). No real token-by-token LLM streaming
 * exists in this codebase today (ai-advisor's Gemma call is synchronous),
 * so a single `start` + `done` pair is the correct v1 scope.
 */

function sseFrame(type: string, payload: unknown): string {
  return `data: ${JSON.stringify({ type, payload })}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: { message?: string; conversationId?: string | null; sessionId?: string; lang?: string };
  try {
    const raw = await req.text();
    body = JSON.parse(raw);
  } catch {
    return new Response(sseFrame("error", { message: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const { message, sessionId } = body;
  // The widget sends its page language; anything but "en" keeps the default Indonesian replies.
  const language = body.lang === "en" ? "en" : "id";
  const conversationIdIn = body.conversationId ?? null;

  if (!sessionId || !message || !message.trim()) {
    return new Response(sseFrame("error", { message: "missing_session_or_message" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const sessionValid = await touchWidgetSession(sessionId);
  if (!sessionValid) {
    return new Response(sseFrame("error", { message: "invalid_session" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const conversationId = await getOrCreateWidgetConversation(sessionId, conversationIdIn);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (type: string, payload: unknown) => controller.enqueue(new TextEncoder().encode(sseFrame(type, payload)));
      enqueue("start", { conversationId });

      await saveWidgetMessage({ conversationId, role: "user", text: message });

      try {
        const reply = await generateWidgetBotReply(conversationId, message, sessionId, language);
        await saveWidgetMessage({
          conversationId,
          role: "bot",
          text: reply.text,
          recommendedProductIds: (reply.products ?? []).map((p: Product) => p.id),
          rawJsonText: reply.rawJsonText ?? null,
        });
        enqueue("done", { answer: reply.text, conversationId, products: reply.products ?? [] });
      } catch (err) {
        enqueue("error", { message: err instanceof Error ? err.message : "unknown_error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
