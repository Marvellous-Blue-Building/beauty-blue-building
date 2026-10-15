// Session-scoped handoff flag set the moment a Google sign-in succeeds on a
// "sign in required" screen (the shared SignInRequiredScreen gate, or the
// guest CTA on Product/Routine). The TopBar's back button reads it so the
// first Back press after signing in lands on Your Routine instead of the
// page the guest arrived from — which is typically /login, since the root
// route redirects every no-session visitor there. Without this, a guest who
// deep-links to /product/<id>, signs in, then taps Back is sent straight
// back to /login. Mirrors the routine-store "arrived from /analyzing"
// handoff pattern; cleared on the next real navigation so it only ever
// affects the immediate post-sign-in Back.
const FROM_SIGNIN_KEY = "beauty-advisor-from-signin";

/** Marks the session as having just signed in from a gate screen. */
export function markSignedInFromGate(): void {
  if (typeof window !== "undefined") sessionStorage.setItem(FROM_SIGNIN_KEY, "true");
}

/** Reads the flag and resets it, so only one Back press is redirected. */
export function consumeSignedInFromGate(): boolean {
  if (typeof window === "undefined") return false;
  const signedIn = sessionStorage.getItem(FROM_SIGNIN_KEY) === "true";
  sessionStorage.setItem(FROM_SIGNIN_KEY, "false");
  return signedIn;
}

/** Drops the flag once the user has navigated elsewhere on their own. */
export function clearSignedInFromGate(): void {
  if (typeof window !== "undefined") sessionStorage.setItem(FROM_SIGNIN_KEY, "false");
}
