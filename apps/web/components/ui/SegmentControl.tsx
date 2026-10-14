"use client";

import { cn } from "@/lib/cn";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentControlProps<T extends string> {
  options: [SegmentOption<T>, SegmentOption<T>];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentControlProps<T>) {
  return (
    <div className="mb-[18px] flex overflow-hidden rounded-[28px] border border-border bg-surface">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 py-[10px] text-[13px] font-bold",
            value === opt.value
              ? "bg-secondary text-white"
              : "text-text-muted"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
