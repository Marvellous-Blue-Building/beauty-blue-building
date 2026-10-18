"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GlassCard } from "./glass";
import { IconSparkle } from "./icons";

interface InsightMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * Vera Intelligence — the tenant's analytics chat ("why did 9.9
 * underperform", "what strategy for 11.11"). Calls /api/admin/insight,
 * which grounds Gemini in real event-calendar data plus sample sales
 * numbers (see data/22_demo_sales.sql) — never a free-form chat.
 */
export function InsightSection() {
  const t = useTranslations("admin.insight");
  const locale = useLocale();
  const [messages, setMessages] = useState<InsightMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = t.raw("suggestions") as string[];

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || loading) return;

    const history = messages.slice(-6).map((m) => `${m.role === "user" ? "Tenant" : "Vera"}: ${m.text}`);
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, conversationContext: history, language: locale }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      setMessages((m) => [...m, { role: "assistant", text: res.ok && data.reply ? data.reply : t("error") }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: t("error") }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-admin-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-admin-ink-muted">{t("subtitle")}</p>
      </div>

      <GlassCard className="flex min-h-0 flex-1 flex-col p-0">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-admin-accent text-white shadow-[0_8px_20px_-6px_rgb(210_98_135/0.7)]">
                <IconSparkle size={22} />
              </span>
              <p className="max-w-sm text-sm text-admin-ink-muted">{t("empty")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="glass-inset rounded-full px-3.5 py-1.5 text-xs text-admin-ink transition hover:bg-white/75"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                      m.role === "user" ? "bg-admin-accent text-white" : "glass-inset text-admin-ink"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="glass-inset rounded-2xl px-4 py-2.5 text-[13.5px] text-admin-ink-muted">{t("thinking")}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-white/60 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            disabled={loading}
            className="glass-field glass-inset h-11 min-w-0 flex-1 rounded-xl px-4 text-sm text-admin-ink placeholder:text-admin-ink-faint focus:border-admin-accent/60 focus:outline-none focus:ring-4 focus:ring-admin-accent/15"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-admin-accent px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(210_98_135/0.7)] transition hover:bg-admin-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("send")}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
