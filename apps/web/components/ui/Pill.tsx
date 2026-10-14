import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "link";
}

export function Pill({ variant = "default", className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-[20px] border px-[11px] py-[5px] text-[10px] font-bold uppercase tracking-[0.6px]",
        variant === "default" &&
          "border-border bg-surface text-text-muted",
        variant === "link" &&
          "cursor-pointer border-secondary bg-surface text-primary",
        className
      )}
      {...props}
    />
  );
}
