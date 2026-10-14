"use client";

import { useTranslations } from "next-intl";
import { SendIcon } from "@/components/layout/TabIcons";

export function ChatInputBar({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  const t = useTranslations("chat");

  function handleSend() {
    if (!value.trim()) return;
    onSend();
  }

  return (
    <div className="flex items-center gap-1.5 rounded-[26px] border border-border bg-surface py-1.5 pr-1.5 pl-4">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSend();
        }}
        placeholder={t("placeholder")}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-faint"
      />
      <button
        type="button"
        onClick={handleSend}
        aria-label="Send"
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-surface disabled:opacity-40"
        disabled={!value.trim()}
      >
        <SendIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
