"use client";

type MessageType = "GOOGLE_AUTH_SUCCESS" | "GOOGLE_AUTH_ERROR";

export interface GoogleSignInResult {
  /** Locale-agnostic path chosen server-side — "/routine" for a returning user with a real scan on file, "/welcome" otherwise. */
  redirectTo: string;
}

/**
 * Opens Google sign-in in a popup window instead of navigating the whole
 * tab away. Listens for the postMessage the callback route sends (see
 * lib/auth/popup-response.ts) and resolves/rejects accordingly. If the
 * popup is blocked, falls back to a full-page redirect (same as before).
 */
export function openGoogleSignInPopup(): Promise<GoogleSignInResult> {
  return new Promise((resolve, reject) => {
    const width = 480;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "/api/auth/google",
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      // Popup blocked — fall back to a normal full-page redirect. This is
      // an API Route Handler (issues its own redirect to Google), not an
      // internal Next.js page, so router.push() doesn't apply here.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/auth/google";
      return;
    }

    let settled = false;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: MessageType; error?: string; redirectTo?: string } | undefined;
      if (data?.type === "GOOGLE_AUTH_SUCCESS") {
        cleanup();
        resolve({ redirectTo: data.redirectTo ?? "/welcome" });
      } else if (data?.type === "GOOGLE_AUTH_ERROR") {
        cleanup();
        reject(new Error(data.error ?? "oauth_failed"));
      }
    }

    // Also resolves/rejects as a no-op if the user closes the popup
    // manually without completing sign-in.
    const closeCheck = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error("popup_closed"));
      }
    }, 500);

    function cleanup() {
      settled = true;
      window.clearInterval(closeCheck);
      window.removeEventListener("message", handleMessage);
    }

    window.addEventListener("message", handleMessage);
  });
}
