"use client";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { buttonClassName } from "@/components/ui/Button";
import type { GoogleSignInResult } from "@/lib/auth/popup-signin";

/**
 * Shared full-screen "sign in required" gate — one consistent UI for every
 * screen whose data is genuinely account-tied server-side (a guest
 * literally can't have one), not just a UI choice to lock them out. Used
 * by Profile and Cart; see lib/route-meta.ts's GUEST_LOCKED_ROUTES for the
 * matching header/tab-bar chrome those same screens also hide.
 *
 * Deliberately NOT used by Routine — guests there see a real routine
 * preview and are only nudged to sign in for "more", not blocked outright,
 * a different UX shape than this all-or-nothing gate.
 */
export function SignInRequiredScreen({
  title,
  subtitle,
  onSignedIn,
}: {
  title: string;
  subtitle: string;
  onSignedIn: (result: GoogleSignInResult) => void | Promise<void>;
}) {
  return (
    <ScreenContainer className="items-center justify-center gap-4 text-center">
      <h2 className="font-display text-[20px] font-semibold text-canvas-ink">{title}</h2>
      <p className="text-[12.5px] text-canvas-ink-muted">{subtitle}</p>
      <GoogleSignInButton className={buttonClassName({ className: "w-full" })} onSignedIn={onSignedIn}>
        Sign in with Google
      </GoogleSignInButton>
    </ScreenContainer>
  );
}
