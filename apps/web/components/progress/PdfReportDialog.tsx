"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PdfPagesViewer } from "@/components/progress/PdfPagesViewer";
import { buttonClassName } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type PdfAction = "download" | "email";

const ACTIONS: PdfAction[] = ["download", "email"];

/**
 * "Choose action" popup for a single progress-history PDF report — embeds an
 * inline PDF reader at the top, with the Download now / Send to my email
 * options beneath it, then Submit/Cancel. Purely presentational: the parent
 * owns which report id is open and performs the real download/email,
 * resolving (and closing this) on success.
 */
export function PdfReportDialog({
  previewUrl,
  onCancel,
  onConfirm,
}: {
  previewUrl: string;
  onCancel: () => void;
  onConfirm: (action: PdfAction) => Promise<void>;
}) {
  const t = useTranslations("progress");
  const tc = useTranslations("common");
  const [action, setAction] = useState<PdfAction>("download");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      await onConfirm(action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-[360px] rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-display text-[16px] font-semibold text-canvas-ink">
          {t("chooseAction")}
        </h2>

        <div className="mb-4">
          <PdfPagesViewer src={previewUrl} />
        </div>

        <div className="mb-5 flex flex-col gap-2.5">
          {ACTIONS.map((value) => {
            const selected = action === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAction(value)}
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[13.5px] font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary-dim text-canvas-ink"
                    : "border-border bg-surface text-canvas-ink-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-primary" : "border-border"
                  )}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                {value === "download" ? t("downloadNow") : t("sendToMyEmail")}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={buttonClassName({ variant: "ghost", disabled: busy, className: "flex-1" })}
          >
            {tc("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className={buttonClassName({ disabled: busy, className: "flex-1" })}
          >
            {t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
