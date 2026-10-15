"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import { PdfReportDialog, type PdfAction } from "@/components/progress/PdfReportDialog";
import { buttonClassName } from "@/components/ui/Button";
import { getJSON, postJSON, ApiError } from "@/lib/api-client";
import { formatDateTimeDashed, scanReportFileName } from "@/lib/format";
import { useAuthStore } from "@/lib/store/auth-store";
import { useToastStore } from "@/lib/store/toast-store";
import type { ProgressHistoryItem } from "@/types/progress";

export default function ProgressHistoryPage() {
  const t = useTranslations("progress");
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const showToast = useToastStore((s) => s.showToast);
  const [items, setItems] = useState<ProgressHistoryItem[] | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    getJSON<ProgressHistoryItem[]>("/api/progress/history")
      .then(setItems)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setItems([]);
        } else {
          throw err;
        }
      });
  }, []);

  if (authLoaded && !user) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={fetchUser}
      />
    );
  }

  if (items === null) return null;

  async function handleConfirm(action: PdfAction) {
    if (!reportId) return;
    const item = items?.find((i) => i.id === reportId);
    try {
      if (action === "download") {
        const res = await fetch(`/api/progress/history/${reportId}`);
        if (!res.ok) throw new Error(`Download failed with ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = scanReportFileName(user?.email ?? "", item?.createdAt ?? new Date().toISOString());
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        showToast(t("downloadReady"));
      } else {
        await postJSON(`/api/progress/history/${reportId}`);
        showToast(t("emailSent"));
      }
      setReportId(null);
    } catch (error) {
      console.error("PDF report action failed:", error);
      showToast(error instanceof ApiError && error.code === "email_unavailable" ? t("emailUnavailable") : t("actionFailed"));
    }
  }

  return (
    <ScreenContainer>
      {items.length === 0 ? (
        <p className="mt-6 text-center text-[12.5px] text-text-muted">{t("historyEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-[14px] border border-border bg-surface p-[13px]"
            >
              <div className="font-mono text-[10px] text-text-faint">
                {formatDateTimeDashed(item.createdAt)}
              </div>
              <div className="mt-[3px] flex items-center justify-between gap-3">
                <span className="text-[13.5px] font-bold text-text">
                  {t("progressNo", { n: items.length - index })}
                </span>
                <div className="flex items-center gap-3">
                  {item.overall !== null && (
                    <span className="text-[13.5px] font-bold text-text">
                      {t("scoreOutOf", { n: item.overall })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setReportId(item.id)}
                    style={{ fontSize: "10px", paddingTop: "5px", paddingBottom: "5px" }}
                    className={buttonClassName({
                      variant: "ghost",
                      className: "shrink-0 px-3.5",
                    })}
                  >
                    {t("yourPdfReport")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reportId && (
        <PdfReportDialog
          previewUrl={`/api/progress/history/${reportId}`}
          onCancel={() => setReportId(null)}
          onConfirm={handleConfirm}
        />
      )}
    </ScreenContainer>
  );
}
