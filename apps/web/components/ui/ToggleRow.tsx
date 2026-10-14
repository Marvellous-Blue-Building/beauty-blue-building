import type { ReactNode } from "react";
import { Toggle } from "@/components/ui/Toggle";

interface ToggleRowProps {
  label: ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  showToggle?: boolean;
  onClick?: () => void;
}

export function ToggleRow({
  label,
  checked = false,
  onChange,
  showToggle = true,
  onClick,
}: ToggleRowProps) {
  return (
    <div
      onClick={onClick}
      className="mb-[9px] flex items-center justify-between rounded-xl border border-border bg-surface px-[13px] py-3 text-[13px] font-semibold text-text"
    >
      <span>{label}</span>
      {showToggle && <Toggle checked={checked} onChange={onChange} />}
    </div>
  );
}
