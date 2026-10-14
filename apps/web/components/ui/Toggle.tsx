"use client";

import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-xl border transition-colors",
        checked ? "border-primary bg-primary" : "border-border bg-surface-2"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] left-[2px] h-[16px] w-[16px] rounded-full transition-transform",
          checked ? "translate-x-4 bg-surface" : "translate-x-0 bg-text-muted"
        )}
      />
    </button>
  );
}
