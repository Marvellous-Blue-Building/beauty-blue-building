import { create } from "zustand";
import { getJSON } from "@/lib/api-client";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

interface AuthState {
  user: SessionUser | null;
  loaded: boolean;
  fetchUser: () => Promise<void>;
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
  fetchUser: async () => {
    const user = await getJSON<SessionUser | null>("/api/auth/me");
    set({ user, loaded: true });
  },
}));
