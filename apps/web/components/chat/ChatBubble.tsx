"use client";

import type { ChatMessage } from "@/types/chat";
import { RobotIcon, ProfileIcon } from "@/components/layout/TabIcons";
import { useAuthStore } from "@/lib/store/auth-store";
import { formatTime } from "@/lib/format";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Nav button artwork + display label, keyed by target — the backend's
// btn.label ("Skin Scanning Analysis Tool") drives routing/history-text
// parsing (see lib/chat/bot-reply.ts), but the card shown here uses its own
// shorter caption per design.
const NAV_BUTTON_CARD: Record<string, { image: string; caption: string }> = {
  "progress/check-in": { image: "/assets/chat/skin-scan-analysis.png", caption: "Skin scan analysis" },
  progress: { image: "/assets/chat/track-progress.png", caption: "Track your progress" },
};

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

export function ChatBubble({ message, disabledNav = false }: { message: ChatMessage; disabledNav?: boolean }) {
  const router = useRouter();

  if (message.role === "bot") {
    const cleanText = message.text?.replace(/\[Track Your Progress\]/g, "").replace(/\[Skin Scanning Analysis Tool\]/g, "").trim();

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-[9px]">
          <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mint to-secondary text-surface shadow-[0_0_14px_-2px_rgba(224,169,150,0.7)]">
            <RobotIcon className="h-[15px] w-[15px]" />
          </span>
          <div className="max-w-[78%] rounded-2xl rounded-bl-[4px] border border-border bg-surface px-[13px] py-[11px] text-[13px] leading-relaxed text-text">
            {message.pending ? <TypingDots /> : cleanText}
          </div>
          {!message.pending && <Timestamp createdAt={message.createdAt} />}
        </div>
        {!message.pending && message.navButtons && message.navButtons.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-[36px]">
            {message.navButtons.map((btn, idx) => {
              const card = NAV_BUTTON_CARD[btn.target];
              return (
                <button
                  key={idx}
                  disabled={disabledNav}
                  onClick={() => !disabledNav && router.push(`/${btn.target}`)}
                  className={`flex w-[110px] flex-col items-center gap-1 rounded-[8px] bg-surface-2 p-[5px] shadow-sm transition-transform active:scale-95 ${
                    disabledNav ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  {card && (
                    <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-[10px]">
                      <Image src={card.image} alt={card.caption} fill sizes="100px" className="object-cover" />
                    </div>
                  )}
                  <span className="text-center text-[11px] font-medium text-text">
                    {card?.caption ?? btn.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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
