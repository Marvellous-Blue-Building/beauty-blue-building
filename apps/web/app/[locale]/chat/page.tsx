"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { ChatTranscript } from "@/components/chat/ChatTranscript";
import { ChatSuggestRow } from "@/components/chat/ChatSuggestRow";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getJSON, postJSON, deleteJSON, ApiError } from "@/lib/api-client";
import { useChatUIStore } from "@/lib/store/chat-ui-store";
import type { ChatMessage, ConversationDetail, ConversationSummary } from "@/types/chat";

export default function ChatPage() {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const clearToken = useChatUIStore((s) => s.clearToken);
  const [prevClearToken, setPrevClearToken] = useState(clearToken);
  if (clearToken !== prevClearToken) {
    setPrevClearToken(clearToken);
    if (conversationId) setShowClearConfirm(true);
  }

  // This screen is one persistent, ongoing conversation — it resumes the
  // user's existing conversation on every visit (not a fresh one each
  // time) and keeps accumulating messages indefinitely until they
  // explicitly hit Clear Chat.
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
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", text, createdAt: new Date().toISOString() },
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
          ...prev.map((m) => (m.id === optimisticId ? res.message : m)),
          res.botMessage,
        ]);
      })
      .catch((err) => {
        // Guest (401) — message still shows locally, just isn't persisted.
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      });
  }

  function performClear() {
    setShowClearConfirm(false);
    if (!conversationId) return;
    deleteJSON(`/api/chat/conversations/${conversationId}`).then(async () => {
      // The pinned greeting survives server-side — re-fetch instead of
      // blindly clearing so it still shows.
      const detail = await getJSON<ConversationDetail>(`/api/chat/conversations/${conversationId}`);
      setMessages(detail.messages);
    });
  }

  return (
    <ScreenContainer className="!h-full pb-[18px]">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[11px] pb-2.5">
          {/* Nothing is stored until the user's first real send (see
              handleSend) — until then this is a local-only bubble, not a
              DB row. Once a conversation exists, its real pinned greeting
              (first item in `messages`) takes over. */}
          {messages.length === 0 && (
            <ChatBubble
              message={{ id: "greeting", role: "bot", text: t("greeting"), createdAt: new Date().toISOString() }}
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
