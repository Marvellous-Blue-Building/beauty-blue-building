import { create } from "zustand";
import { getJSON, postJSON } from "@/lib/api-client";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  /** "Get Realtime Location" preference (Profile screen) — gates
   * components/layout/LocationTracker.tsx's periodic geolocation polling. */
  realtimeLocationEnabled: boolean;
}

interface AuthState {
  user: SessionUser | null;
  loaded: boolean;
  /** True once a previously-signed-in session has been found dead
   * server-side — distinct from a plain guest who never signed in at all.
   * Read globally by TopBar/TabBarGate to swap in the "Session expired"
   * chrome regardless of which screen detected it. */
  sessionExpired: boolean;
  fetchUser: () => Promise<void>;
  /** Call when a protected endpoint 401s for a user the client believed
   * was signed in — clears the stale local session and the (already-dead)
   * cookie server-side, "automatically logging out" instead of leaving the
   * UI showing a user who no longer has a real session. */
  markSessionExpired: () => void;
}

// Durable (survives a full page reload) marker that a real session existed
// on this browser at some point — set whenever fetchUser() finds a real
// user. Needed because fetchUser() itself is what StoreBootstrap calls on
// EVERY page load, including the very load where a dead session is first
// discovered: by the time any page's own 401 handler runs, fetchUser()
// has usually already raced ahead and nulled out the in-memory `user`,
// so checking that in-memory value can never actually catch "this used to
// be a real session" — only this localStorage marker survives that race.
const HAD_SESSION_KEY = "beauty-advisor-had-session";

function hasSessionMarker(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(HAD_SESSION_KEY) === "1";
}

function setSessionMarker(): void {
  if (typeof window !== "undefined") localStorage.setItem(HAD_SESSION_KEY, "1");
}

/** Clears the "had a session" marker — call on an intentional logout (as
 * opposed to a session dying on its own) so a later guest visit gets the
 * normal sign-in prompt instead of being mislabeled "Session expired". */
export function clearSessionMarker(): void {
  if (typeof window !== "undefined") localStorage.removeItem(HAD_SESSION_KEY);
}

/**
 * Client-side cache of the real session (GET /api/auth/me) — used to tell a
 * signed-in user from a guest ("Continue as Guest") for the restricted
 * guest journey, without a separate fake client-only flag that could drift
 * out of sync with the actual backend session.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loaded: false,
  sessionExpired: false,
  fetchUser: async () => {
    const user = await getJSON<SessionUser | null>("/api/auth/me");
    if (user) {
      setSessionMarker();
      set({ user, loaded: true, sessionExpired: false });
    } else {
      // No real user now — "expired" only if this browser is known to have
      // had a real session before; otherwise it's just a guest.
      set({ user: null, loaded: true, sessionExpired: hasSessionMarker() });
    }
  },
  markSessionExpired: () => {
    set({ user: null, sessionExpired: true });
    postJSON("/api/auth/logout").catch(() => {});
  },
}));
