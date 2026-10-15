"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store/auth-store";
import { postJSON, patchJSON } from "@/lib/api-client";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Mounted once app-wide (see app/[locale]/layout.tsx). Reacts to the auth
 * store's user going from signed-out to signed-in — which covers both a
 * first-time Google sign-in (the popup's onSignedIn handlers all call
 * fetchUser()) and a returning session rehydrating on page load
 * ("relogin") via StoreBootstrap's own fetchUser() call — by requesting
 * the browser's geolocation permission immediately and then polling
 * every 5 minutes for as long as "Get Realtime Location" stays on.
 */
export function LocationTracker() {
  const userId = useAuthStore((s) => s.user?.id);
  const enabled = useAuthStore((s) => s.user?.realtimeLocationEnabled ?? false);

  useEffect(() => {
    if (!userId || !enabled) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    function pingLocation() {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          postJSON("/api/profile/location", {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }).catch(() => {});
        },
        (error) => {
          // A denied/revoked permission means every future tick would just
          // fail the same way — flip the toggle off (DB + the auth store,
          // which is what actually gates this effect) so the Profile
          // screen's UI reflects reality instead of silently showing "on"
          // forever. Transient failures (timeout, position unavailable)
          // are left alone; the browser doesn't remember those, so the
          // next 5-minute tick can simply succeed.
          if (error.code === error.PERMISSION_DENIED) {
            patchJSON("/api/profile", { realtimeLocationEnabled: false })
              .then(() => useAuthStore.getState().fetchUser())
              .catch(() => {});
          }
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 }
      );
    }

    pingLocation(); // immediate — this is what triggers the permission prompt
    const interval = setInterval(pingLocation, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, enabled]);

  return null;
}
