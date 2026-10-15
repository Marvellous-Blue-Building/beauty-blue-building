import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Toggle } from "@/components/ui/Toggle";

interface ToggleRowProps {
  label: ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  showToggle?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function ToggleRow({
  label,
  checked = false,
  onChange,
  showToggle = true,
  onClick,
  disabled = false,
}: ToggleRowProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={cn(
        "mb-[9px] flex items-center justify-between rounded-xl border border-border bg-surface px-[13px] py-3 text-[13px] font-semibold text-text",
        disabled && "opacity-50"
      )}
    >
      <span>{label}</span>
      {showToggle && <Toggle checked={checked} onChange={onChange} disabled={disabled} />}
    </div>
  );
}
