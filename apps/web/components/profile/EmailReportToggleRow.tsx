"use client";

import { useTranslations } from "next-intl";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { patchJSON } from "@/lib/api-client";

export function EmailReportToggleRow({
  checked,
  onChanged,
  smtpConfigured,
}: {
  checked: boolean;
  onChanged: (checked: boolean) => void;
  /** Server-side SMTP env var check (see lib/email/smtp-client.ts's
   * isSmtpConfigured) — the toggle is disabled (not just hidden) when
   * false, since turning it on wouldn't do anything; PATCH /api/profile
   * rejects enabling it server-side too, this is purely so the user isn't
   * left clicking a control that silently does nothing. */
  smtpConfigured: boolean;
}) {
  const t = useTranslations("profile");

  async function handleToggle(next: boolean) {
    onChanged(next); // optimistic
    try {
      await patchJSON("/api/profile", { sendReportEmail: next });
    } catch {
      onChanged(!next); // rollback on failure
    }
  }

  return (
    <>
      <ToggleRow
        label={t("sendReportToEmail")}
        checked={checked && smtpConfigured}
        onChange={handleToggle}
        disabled={!smtpConfigured}
      />
      {!smtpConfigured && (
        <p className="-mt-1.5 mb-[9px] px-1 text-[10.5px] text-text-faint">
          {t("sendReportToEmailUnavailable")}
        </p>
      )}
    </>
  );
}
