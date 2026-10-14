"use client";

import { cn } from "@/lib/cn";
import { useSavedStore } from "@/lib/store/saved-store";

/** Heart icon-only save toggle — used on product cards. `compact` shrinks
 * it for the 130px-wide chat product list (see ChatProductList). */
export function SaveButton({ productId, compact = false }: { productId: string; compact?: boolean }) {
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
        "absolute z-10 flex items-center justify-center rounded-full border leading-none",
        compact ? "top-1.5 right-1.5 h-[20px] w-[20px] text-[10px]" : "top-2 right-2 h-[27px] w-[27px] text-[13px]",
        saved ? "border-mint bg-mint text-text" : "border-border bg-surface text-text-muted"
      )}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
