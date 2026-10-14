"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { openGoogleSignInPopup, type GoogleSignInResult } from "@/lib/auth/popup-signin";

export function GoogleSignInButton({
  className,
  children,
  onSignedIn,
}: {
  className?: string;
  children: ReactNode;
  /** Called after the popup reports success — refetch whatever auth-gated data this screen needs. Receives the server-chosen post-login destination ("/routine" for a returning user with a scan on file, "/welcome" otherwise). */
  onSignedIn: (result: GoogleSignInResult) => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const result = await openGoogleSignInPopup();
      await onSignedIn(result);
    } catch {
      // Popup closed or sign-in failed — nothing to do, button just resets.
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={pending} className={className}>
      {children}
    </button>
  );
}
