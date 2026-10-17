import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * Admin glassmorphism primitives — the building blocks every admin screen
 * must use (see docs/admin-ui-guidelines.md). Tokens and the `glass-panel` /
 * `glass-inset` utilities live in app/globals.css.
 */

export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("glass-panel rounded-3xl", className)}>{children}</div>;
}

export function GlassInput({
  className,
  leading,
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode; trailing?: ReactNode }) {
  return (
    <div
      className={clsx(
        "glass-field glass-inset flex items-center gap-2.5 rounded-xl px-3.5 transition focus-within:border-admin-accent/60 focus-within:ring-4 focus-within:ring-admin-accent/15",
        className,
      )}
    >
      {leading && <span className="shrink-0 text-admin-ink-faint">{leading}</span>}
      <input
        {...props}
        className="h-11 min-w-0 flex-1 bg-transparent text-sm text-admin-ink placeholder:text-admin-ink-faint focus:outline-none"
      />
      {trailing}
    </div>
  );
}

export function GlassButton({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary"
          ? "bg-admin-accent text-white shadow-[0_8px_20px_-6px_rgb(210_98_135/0.55)] hover:bg-admin-accent-strong"
          : "glass-inset text-admin-ink hover:bg-white/70",
        className,
      )}
    />
  );
}

/*
 * Class-string primitives for markup that can't easily become a component
 * (raw <input>/<select>, table cells, inline pills). Use these instead of
 * neutral-* borders / bg-white in any admin screen.
 */

/** Text input / select on glass (40px). */
export const glassFieldCls =
  "glass-field glass-inset h-10 rounded-xl px-3.5 text-sm text-neutral-700 placeholder:text-admin-ink-faint transition focus:border-admin-accent/60 focus:outline-none focus:ring-4 focus:ring-admin-accent/15";
/** Compact field for inline table editing (32px). */
export const glassFieldSmCls =
  "glass-field glass-inset h-8 rounded-lg px-2.5 text-xs text-neutral-700 transition focus:border-admin-accent/60 focus:outline-none focus:ring-4 focus:ring-admin-accent/15";

export const btnPrimaryCls =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-admin-accent px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(210_98_135/0.7)] transition hover:bg-admin-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondaryCls =
  "glass-inset inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-neutral-700 transition hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondarySmCls =
  "glass-inset inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-[11px] font-medium text-neutral-700 transition hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-50";
export const linkAccentCls = "font-medium text-admin-accent-strong hover:underline";

/** Table header / body cells — header row reads as one glass strip. */
export const thGlassCls =
  "bg-white/55 px-3 py-2.5 text-left text-xs font-semibold text-neutral-700 first:rounded-l-xl last:rounded-r-xl";
export const tdGlassCls = "border-b border-white/60 px-3 py-2.5 text-[13px] text-neutral-700 align-top";

/** Soft inner panel for list items / stat boxes inside a glass card. */
export const subtlePanelCls = "rounded-xl border border-white/70 bg-white/40";

export type PillTone = "success" | "danger" | "warning" | "alert" | "accent" | "neutral";
const PILL_TONES: Record<PillTone, string> = {
  success: "border-admin-success/20 bg-admin-success/10 text-admin-success",
  danger: "border-admin-danger/20 bg-admin-danger/10 text-admin-danger",
  warning: "border-admin-warning/30 bg-admin-warning/15 text-[#9a6b06]",
  alert: "border-admin-rose-strong/30 bg-admin-rose/40 text-[#a5513f]",
  accent: "border-admin-accent/25 bg-admin-accent/10 text-admin-accent-strong",
  neutral: "border-white/80 bg-white/55 text-admin-nav-ink",
};
/** Status pill classes by semantic tone (docs/admin-ui-guidelines.md §2). */
export function pillCls(tone: PillTone) {
  return `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${PILL_TONES[tone]}`;
}
