import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Chip({ active = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "whitespace-nowrap rounded-[20px] border px-[13px] py-[7px] text-[11.5px] font-semibold",
        active
          ? "border-primary bg-primary text-surface"
          : "border-border bg-surface text-text-muted",
        className
      )}
      {...props}
    />
  );
}
