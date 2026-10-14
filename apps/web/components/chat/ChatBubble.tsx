"use client";

import type { ChatMessage } from "@/types/chat";
import { RobotIcon, ProfileIcon } from "@/components/layout/TabIcons";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatTime } from "@/lib/format";

function UserAvatar() {
  const avatarUrl = useAuthStore((s) => s.user?.avatarUrl ?? null);

  if (avatarUrl) {
    return (
      <span
        className="h-[27px] w-[27px] shrink-0 rounded-full bg-cover bg-center"
        style={{ backgroundImage: `url(${avatarUrl})` }}
      />
    );
  }

  return (
    <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-primary-dim text-primary">
      <ProfileIcon className="h-[15px] w-[15px]" />
    </span>
  );
}

function Timestamp({ createdAt }: { createdAt: string }) {
  return (
    <span className="shrink-0 pb-[2px] font-mono text-[9.5px] text-text-faint">
      {formatTime(createdAt)}
    </span>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-[2px]" aria-label="AI Advisor is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[6px] w-[6px] animate-bounce rounded-full bg-text-faint"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "bot") {
    return (
      <div className="flex items-end gap-[9px]">
        <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mint to-secondary text-surface shadow-[0_0_14px_-2px_rgba(224,169,150,0.7)]">
          <RobotIcon className="h-[15px] w-[15px]" />
        </span>
        <div className="max-w-[78%] rounded-2xl rounded-bl-[4px] border border-border bg-surface px-[13px] py-[11px] text-[13px] leading-relaxed text-text">
          {message.pending ? <TypingDots /> : message.text}
        </div>
        {!message.pending && <Timestamp createdAt={message.createdAt} />}
      </div>
    );
  }

  if (message.imageColor) {
    return (
      <div className="flex items-end justify-end gap-[9px]">
        <Timestamp createdAt={message.createdAt} />
        <div className="max-w-[78%] rounded-2xl rounded-br-[4px] bg-surface-2 p-1">
          <div className="h-[100px] w-[140px] rounded-xl bg-gradient-to-br from-secondary-dim to-mint-dim" />
        </div>
        <UserAvatar />
      </div>
    );
  }

  return (
    <div className="flex items-end justify-end gap-[9px]">
      <Timestamp createdAt={message.createdAt} />
      <div className="max-w-[78%] rounded-2xl rounded-br-[4px] bg-primary px-[13px] py-[11px] text-[13px] font-medium text-surface">
        {message.text}
      </div>
      <UserAvatar />
    </div>
  );
}
