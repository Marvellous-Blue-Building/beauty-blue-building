"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatTranscript } from "@/components/chat/ChatTranscript";
import { ChatSuggestRow } from "@/components/chat/ChatSuggestRow";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getJSON, postJSON, ApiError } from "@/lib/api-client";
import { useChatUIStore } from "@/lib/store/chat-ui-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import type { ChatMessage, ConversationDetail, ConversationSummary } from "@/types/chat";

export default function ChatPage() {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const clearToken = useChatUIStore((s) => s.clearToken);
  const setCanClear = useChatUIStore((s) => s.setCanClear);
  const [prevClearToken, setPrevClearToken] = useState(clearToken);
  // Nothing worth clearing when the only bubble shown is the greeting
  // (TopBar disables the trash-icon button for this same condition).
  const canClear = messages.length > 1;
  if (clearToken !== prevClearToken) {
    setPrevClearToken(clearToken);
    if (canClear) setShowClearConfirm(true);
  }

  useEffect(() => {
    setCanClear(canClear);
  }, [canClear, setCanClear]);

  // Resumes the user's most recent conversation on every visit (not a
  // fresh one each time), accumulating messages indefinitely — until
  // "Clear Chat" starts a brand new session (see performClear). That does
  // NOT delete the old conversation; it stays fully intact and browsable
  // at /chat/history, it just stops being the one this screen resumes.
  useEffect(() => {
    getJSON<ConversationSummary[]>("/api/chat/conversations")
      .then(async (conversations) => {
        const current = conversations[0];
        if (!current) return;
        setConversationId(current.id);
        const detail = await getJSON<ConversationDetail>(`/api/chat/conversations/${current.id}`);
        setMessages(detail.messages);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      });
  }, []);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    const optimisticId = `local-${Date.now()}`;
    const pendingBotId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", text, createdAt: new Date().toISOString() },
      // Shown while waiting on the real reply — the ambiguous-message path
      // calls out to services/ai-advisor (Gemma), which can take a few
      // seconds, so a bouncing-dots bubble stands in until it resolves.
      { id: pendingBotId, role: "bot", pending: true, createdAt: new Date().toISOString() },
    ]);
    setDraft("");
    postJSON<{
      conversationId: string;
      greetingMessage: ChatMessage | null;
      message: ChatMessage;
      botMessage: ChatMessage;
    }>("/api/chat/messages", { conversationId, text })
      .then((res) => {
        setConversationId(res.conversationId);
        setMessages((prev) => [
          // First-ever send: the greeting is only real (DB-backed) from
          // this point on — prepend it ahead of the just-sent message.
          ...(res.greetingMessage ? [res.greetingMessage] : []),
          ...prev.map((m) => {
            if (m.id === optimisticId) return res.message;
            if (m.id === pendingBotId) return res.botMessage;
            return m;
          }),
        ]);
      })
      .catch((err) => {
        // Guest (401) — message still shows locally, just isn't persisted;
        // there's no bot reply coming, so drop the pending bubble. Every
        // other failure mode now always gets a real stored bot message
        // from the route (including an honest error notice if
        // generateBotReply itself failed — see route.ts), so this is the
        // only case left to handle client-side.
        if (!(err instanceof ApiError && err.status === 401)) throw err;
        setMessages((prev) => prev.filter((m) => m.id !== pendingBotId));
      });
  }

  function performClear() {
    setShowClearConfirm(false);
    // Starts a brand new conversation — the previous one is left
    // completely untouched in the DB, still browsable at /chat/history.
    postJSON<{ conversationId: string; greetingMessage: ChatMessage }>("/api/chat/conversations").then(
      (res) => {
        setConversationId(res.conversationId);
        setMessages([res.greetingMessage]);
      }
    );
  }

  if (authLoaded && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={fetchUser}
      />
    );
  }

  return (
    <ScreenContainer className="!h-full pb-[18px]">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[11px] pb-2.5">
          {/* Nothing is stored until the user's first real send (see
              handleSend) — until then this is a local-only bubble, not a
              DB row. Once a conversation exists, its real pinned greeting
              (first item in `messages`) takes over. Hardcoded Indonesian
              to match that real greeting (lib/chat/create-conversation.ts)
              — the AI Advisor always responds in Bahasa Indonesia,
              independent of the app's own UI locale. */}
          {messages.length === 0 && (
            <ChatBubble
              message={{
                id: "greeting",
                role: "bot",
                text: "Halo, ini AI Advisor. Ada yang bisa saya bantu?",
                createdAt: new Date().toISOString(),
              }}
            />
          )}
          <ChatTranscript messages={messages} />
        </div>
      </div>
      <div className="shrink-0 pt-2.5">
        <ChatSuggestRow
          suggestions={[t("suggestAdjust"), t("suggestRetinol"), t("suggestCheck")]}
          onSelect={setDraft}
        />
        <ChatInputBar value={draft} onChange={setDraft} onSend={handleSend} />
      </div>

      {showClearConfirm && (
        <ConfirmDialog
          title={t("clearConfirmTitle")}
          message={t("clearConfirm")}
          confirmLabel={tc("yes")}
          cancelLabel={tc("no")}
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={performClear}
        />
      )}
    </ScreenContainer>
  );
}
