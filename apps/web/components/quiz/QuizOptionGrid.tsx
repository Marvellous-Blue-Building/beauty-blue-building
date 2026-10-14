"use client";

import { cn } from "@/lib/cn";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface QuizOptionGridProps<T extends string> {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

/** Single-select 2-column grid — used for skin type, goals, and climate. */
export function QuizOptionGrid<T extends string>({
  options,
  value,
  onChange,
}: QuizOptionGridProps<T>) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-[10px]">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[14px] border px-[10px] py-4 text-center text-[13px] font-semibold select-none",
              selected
                ? "border-primary bg-primary-dim text-text"
                : "border-border bg-surface text-text"
            )}
          >
            <div
              className={cn(
                "mx-auto mb-[10px] h-8 w-8 rounded-[9px] border border-border",
                selected ? "border-primary bg-primary" : "bg-surface-2"
              )}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
