"use client";

import { useTranslations } from "next-intl";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { patchJSON } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth-store";

export function LocationToggleRow({
  checked,
  address,
  onChanged,
}: {
  checked: boolean;
  /** Full reverse-geocoded address from the last location ping, or null
   * until the first one lands. */
  address: string | null;
  onChanged: (checked: boolean) => void;
}) {
  const t = useTranslations("profile");
  const fetchUser = useAuthStore((s) => s.fetchUser);

  async function handleToggle(next: boolean) {
    onChanged(next); // optimistic
    try {
      await patchJSON("/api/profile", { realtimeLocationEnabled: next });
      // Refreshes the session's cached flag so LocationTracker (mounted
      // app-wide, driven by the auth store) picks up the new state right
      // away instead of waiting for the next login.
      await fetchUser();
    } catch {
      onChanged(!next); // rollback on failure
    }
  }

  return (
    <>
      <ToggleRow label={t("realtimeLocation")} checked={checked} onChange={handleToggle} />
      <p className="-mt-1.5 mb-[9px] px-1 text-[10.5px] text-text-faint">
        {address ?? t("realtimeLocationPending")}
      </p>
    </>
  );
}
