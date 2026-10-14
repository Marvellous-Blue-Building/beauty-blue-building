import type { CompatibilityNote } from "@/types/product";
import { cn } from "@/lib/cn";

export function CompatRow({ note }: { note: CompatibilityNote }) {
  return (
    <div className="mb-2 flex items-center gap-[9px] rounded-xl border border-border bg-surface px-[11px] py-[11px] text-[12px] text-text">
      <span
        className={cn(
          "h-[9px] w-[9px] shrink-0 rounded-full",
          note.ok ? "bg-mint shadow-[0_0_8px_0_var(--color-mint)]" : "bg-warn"
        )}
      />
      {note.label}
    </div>
  );
}
