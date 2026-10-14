"use client";

import { cn } from "@/lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface QuizChecklistProps<T extends string> {
  options: Option<T>[];
  value: T[];
  onToggle: (value: T) => void;
}

/** Multi-select checklist — used for concerns and sensitivities. */
export function QuizChecklist<T extends string>({
  options,
  value,
  onToggle,
}: QuizChecklistProps<T>) {
  return (
    <div>
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={cn(
              "mb-[9px] flex w-full items-center gap-3 rounded-xl border px-[14px] py-[13px] text-left text-[13.5px] font-medium",
              selected
                ? "border-primary bg-primary-dim text-text"
                : "border-border bg-surface text-text"
            )}
          >
            <span
              className={cn(
                "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[12px] font-extrabold",
                selected
                  ? "border-primary bg-primary text-surface"
                  : "border-text-faint"
              )}
            >
              {selected ? "✓" : ""}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
