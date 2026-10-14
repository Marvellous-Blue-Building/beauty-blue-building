"use client";

import { cn } from "@/lib/cn";
import { useSavedStore } from "@/lib/store/saved-store";

/** Heart icon-only save toggle — used on product cards. */
export function SaveButton({ productId }: { productId: string }) {
  const saved = useSavedStore((s) => s.isSaved(productId));
  const toggleSave = useSavedStore((s) => s.toggleSave);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSave(productId);
      }}
      aria-label={saved ? "Remove from saved products" : "Save product"}
      className={cn(
        "absolute top-2 right-2 z-10 flex h-[27px] w-[27px] items-center justify-center rounded-full border text-[13px] leading-none",
        saved ? "border-mint bg-mint text-text" : "border-border bg-surface text-text-muted"
      )}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
