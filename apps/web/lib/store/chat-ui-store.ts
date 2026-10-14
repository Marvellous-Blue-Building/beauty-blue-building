import { create } from "zustand";

/** Lets the layout-level TopBar's "Clear Chat" button (header, next to the
 * history icon) signal the /chat page (a separate component) to actually
 * perform the clear — incrementing a token the page watches via effect.
 * `canClear` flows the other way: the page reports whether there's
 * anything worth clearing (more than just the greeting bubble) so TopBar
 * can disable the button instead of starting a pointless new session. */
interface ChatUIState {
  clearToken: number;
  requestClear: () => void;
  canClear: boolean;
  setCanClear: (canClear: boolean) => void;
}

export const useChatUIStore = create<ChatUIState>((set) => ({
  clearToken: 0,
  requestClear: () => set((s) => ({ clearToken: s.clearToken + 1 })),
  canClear: false,
  setCanClear: (canClear) => set({ canClear }),
}));
