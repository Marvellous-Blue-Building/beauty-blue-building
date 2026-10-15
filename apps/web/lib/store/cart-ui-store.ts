import { create } from "zustand";

/** Lets the layout-level TopBar's "Empty Cart" button (header, /cart only)
 * signal the /cart page (a separate component) to actually show the
 * confirmation + perform the empty — incrementing a token the page watches
 * via effect. `canEmpty` flows the other way: the page reports whether
 * there's anything worth emptying so TopBar can disable the button instead
 * of showing a confirmation for an already-empty cart. Same pattern as
 * chat-ui-store.ts's Clear Chat button. */
interface CartUIState {
  emptyToken: number;
  requestEmpty: () => void;
  canEmpty: boolean;
  setCanEmpty: (canEmpty: boolean) => void;
}

export const useCartUIStore = create<CartUIState>((set) => ({
  emptyToken: 0,
  requestEmpty: () => set((s) => ({ emptyToken: s.emptyToken + 1 })),
  canEmpty: false,
  setCanEmpty: (canEmpty) => set({ canEmpty }),
}));
