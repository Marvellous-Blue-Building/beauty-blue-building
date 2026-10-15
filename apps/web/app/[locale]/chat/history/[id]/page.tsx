"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ChatTranscript } from "@/components/chat/ChatTranscript";
import { getJSON, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth-store";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import type { ConversationDetail } from "@/types/chat";

export default function ChatHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [conversation, setConversation] = useState<ConversationDetail | null | undefined>(undefined);

  useEffect(() => {
    getJSON<ConversationDetail>(`/api/chat/conversations/${id}`)
      .then(setConversation)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
          setConversation(null);
        } else {
          throw err;
        }
      });
  }, [id]);

  if (authLoaded && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={fetchUser}
      />
    );
  }

  if (conversation === undefined) return null;
  if (conversation === null) notFound();

  return (
    <ScreenContainer>
      <div className="flex flex-col gap-[11px]">
        <ChatTranscript messages={conversation.messages} disabledNav={true} />
      </div>
    </ScreenContainer>
  );
}
