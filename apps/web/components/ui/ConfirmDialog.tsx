"use client";

import { buttonClassName } from "@/components/ui/Button";

/** Centered modal confirmation — Yes/No, matching the app's card/button styling instead of a native browser confirm(). Mount conditionally (`{open && <ConfirmDialog .../>}`) wherever it's needed. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-[320px] rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="mb-1.5 font-display text-[16px] font-semibold text-canvas-ink">{title}</h2>
        <p className="mb-5 text-[12.5px] leading-relaxed text-canvas-ink-muted">{message}</p>
        {children && <div className="mb-5">{children}</div>}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className={buttonClassName({ variant: "ghost", className: "flex-1" })}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={buttonClassName({ className: "flex-1" })}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
