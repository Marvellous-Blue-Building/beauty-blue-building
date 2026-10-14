"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useSavedStore } from "@/lib/store/saved-store";

/** Pill-with-text save toggle — used on the product detail screen. */
export function SaveButtonLabel({ productId }: { productId: string }) {
  const saved = useSavedStore((s) => s.isSaved(productId));
  const toggleSave = useSavedStore((s) => s.toggleSave);
  const t = useTranslations("product");

  return (
    <button
      type="button"
      onClick={() => toggleSave(productId)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[20px] border px-[14px] py-2 text-[12px] font-bold",
        saved ? "border-mint bg-mint text-text" : "border-border bg-surface text-text-muted"
      )}
    >
      {saved ? t("saved") : t("saveProduct")}
    </button>
  );
}
