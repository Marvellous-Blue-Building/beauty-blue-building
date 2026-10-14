"use client";

import { useTranslations } from "next-intl";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { patchJSON } from "@/lib/api-client";

export function EmailReportToggleRow({
  checked,
  onChanged,
}: {
  checked: boolean;
  onChanged: (checked: boolean) => void;
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
    <ToggleRow label={t("sendReportToEmail")} checked={checked} onChange={handleToggle} />
  );
}
