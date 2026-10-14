import { create } from "zustand";

/** Lets the layout-level TopBar's "Clear Chat" button (header, next to the
 * history icon) signal the /chat page (a separate component) to actually
 * perform the clear — incrementing a token the page watches via effect. */
interface ChatUIState {
  clearToken: number;
  requestClear: () => void;
}

export const useChatUIStore = create<ChatUIState>((set) => ({
  clearToken: 0,
  requestClear: () => set((s) => ({ clearToken: s.clearToken + 1 })),
}));
