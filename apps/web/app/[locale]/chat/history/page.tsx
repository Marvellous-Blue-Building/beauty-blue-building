"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { getJSON, ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { ConversationSummary } from "@/types/chat";

export default function ChatHistoryPage() {
  const t = useTranslations("chat");
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);

  useEffect(() => {
    getJSON<ConversationSummary[]>("/api/chat/conversations")
      .then(setConversations)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setConversations([]);
        } else {
          throw err;
        }
      });
  }, []);

  if (conversations === null) return null;

  return (
    <ScreenContainer>
      {conversations.length === 0 ? (
        <p className="mt-6 text-center text-[12.5px] text-text-muted">{t("noConversations")}</p>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/chat/history/${c.id}`}
              className="rounded-[14px] border border-border bg-surface p-[13px]"
            >
              <div className="text-[13.5px] font-bold text-text">{c.title}</div>
              {c.preview && (
                <div className="mt-[4px] line-clamp-2 text-[11.5px] text-text-muted">{c.preview}</div>
              )}
              <div className="mt-[6px] font-mono text-[10px] text-text-faint">
                {formatDateTime(c.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </ScreenContainer>
  );
}
