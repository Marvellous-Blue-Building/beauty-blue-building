"use client";

import { cn } from "@/lib/cn";
import type { ProgressSnapshot } from "@/types/progress";

/**
 * The Day 0/30/60/90 cards, each showing the face photo captured for that
 * snapshot (Day 0's baseline photo stands in for any later day without one).
 * Tapping an unlocked card selects it as the comparison day above.
 */
export function DayPhotoCards({
  snapshots,
  activeDay,
  onSelect,
}: {
  snapshots: ProgressSnapshot[];
  activeDay: number;
  onSelect: (day: number) => void;
}) {
  return (
    <div className="mb-[18px] grid grid-cols-4 gap-2">
      {snapshots.map((s) => {
        const isActive = activeDay === s.day;
        return (
          <button
            key={s.day}
            type="button"
            disabled={!s.enabled}
            onClick={() => onSelect(s.day)}
            aria-label={s.enabled ? s.label : `${s.label} (locked)`}
            aria-pressed={isActive}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-2xl border p-1.5 transition-colors",
              !s.enabled
                ? "cursor-not-allowed border-border bg-surface opacity-50"
                : isActive
                  ? "border-secondary"
                  : "border-border bg-surface"
            )}
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-border bg-gradient-to-br from-surface to-surface-2">
              {s.enabled && s.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt={s.label} className="h-full w-full object-cover object-center" />
              ) : null}
            </div>
            <span
              className={cn(
                "text-[10.5px] font-bold",
                isActive ? "text-secondary" : "text-text-muted"
              )}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
