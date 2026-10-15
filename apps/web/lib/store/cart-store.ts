import { create } from "zustand";
import type { CartItem } from "@/types/cart";
import { getJSON, postJSON, patchJSON, deleteJSON, ApiError } from "@/lib/api-client";
import { useToastStore } from "@/lib/store/toast-store";
import { cartAddedMessage, SIGN_IN_REQUIRED_MESSAGE } from "@/lib/constants";

interface CartState {
  items: CartItem[];
  loaded: boolean;
  requiresAuth: boolean;
  fetchCart: () => Promise<void>;
  addToCart: (productId: string, productName: string) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  emptyCart: () => Promise<void>;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  loaded: false,
  requiresAuth: false,
  fetchCart: async () => {
    try {
      const items = await getJSON<CartItem[]>("/api/cart");
      set({ items, loaded: true, requiresAuth: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ items: [], loaded: true, requiresAuth: true });
      } else {
        throw err;
      }
    }
  },
  addToCart: async (productId: string, productName: string) => {
    try {
      const items = await postJSON<CartItem[]>("/api/cart", { productId, quantity: 1 });
      set({ items, requiresAuth: false });
      useToastStore.getState().showToast(cartAddedMessage(productName));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ requiresAuth: true });
        useToastStore.getState().showToast(SIGN_IN_REQUIRED_MESSAGE);
      } else {
        throw err;
      }
    }
  },
  setQuantity: async (productId: string, quantity: number) => {
    const items = await patchJSON<CartItem[]>(`/api/cart/${productId}`, { quantity });
    set({ items });
  },
  removeFromCart: async (productId: string) => {
    const items = await deleteJSON<CartItem[]>(`/api/cart/${productId}`);
    set({ items });
  },
  emptyCart: async () => {
    const items = await deleteJSON<CartItem[]>("/api/cart");
    set({ items });
  },
}));
