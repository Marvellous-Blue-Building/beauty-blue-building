import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function buttonClassName(opts: {
  variant?: "primary" | "ghost";
  added?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { variant = "primary", added = false, disabled, className } = opts;
  return cn(
    "rounded-[28px] border px-4 py-[15px] text-center text-[13.5px] font-bold font-ui tracking-[0.2px] transition-colors",
    variant === "primary" &&
      !added &&
      "border-primary bg-primary text-surface shadow-[0_8px_24px_-8px_rgba(166,123,107,0.45)]",
    variant === "primary" && added && "border-mint bg-mint text-text shadow-none",
    variant === "ghost" && "border-border bg-transparent text-canvas-ink",
    disabled && "pointer-events-none opacity-30 shadow-none",
    className
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  added?: boolean;
}

/** For actual <button> actions. For navigation CTAs, use `buttonClassName()` directly on a <Link> instead — an <a> cannot validly contain a <button>. */
export function Button({
  variant = "primary",
  added = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={buttonClassName({ variant, added, disabled, className })}
      {...props}
    />
  );
}
