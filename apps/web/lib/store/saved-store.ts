import { create } from "zustand";
import { getJSON, postJSON, deleteJSON, ApiError } from "@/lib/api-client";
import { useToastStore } from "@/lib/store/toast-store";
import { SAVE_ADDED_MESSAGE, SAVE_REMOVED_MESSAGE, SIGN_IN_REQUIRED_MESSAGE } from "@/lib/constants";

interface SavedState {
  productIds: string[];
  loaded: boolean;
  requiresAuth: boolean;
  fetchSaved: () => Promise<void>;
  toggleSave: (productId: string) => Promise<void>;
  isSaved: (productId: string) => boolean;
  emptySaved: () => Promise<void>;
}

export const useSavedStore = create<SavedState>((set, get) => ({
  productIds: [],
  loaded: false,
  requiresAuth: false,
  fetchSaved: async () => {
    try {
      const productIds = await getJSON<string[]>("/api/saved-products");
      set({ productIds, loaded: true, requiresAuth: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ productIds: [], loaded: true, requiresAuth: true });
      } else {
        throw err;
      }
    }
  },
  toggleSave: async (productId: string) => {
    const alreadySaved = get().productIds.includes(productId);
    try {
      if (alreadySaved) {
        const productIds = await deleteJSON<string[]>(`/api/saved-products/${productId}`);
        set({ productIds, requiresAuth: false });
        useToastStore.getState().showToast(SAVE_REMOVED_MESSAGE);
      } else {
        const productIds = await postJSON<string[]>("/api/saved-products", { productId });
        set({ productIds, requiresAuth: false });
        useToastStore.getState().showToast(SAVE_ADDED_MESSAGE);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ requiresAuth: true });
        useToastStore.getState().showToast(SIGN_IN_REQUIRED_MESSAGE);
      } else {
        throw err;
      }
    }
  },
  isSaved: (productId: string) => get().productIds.includes(productId),
  emptySaved: async () => {
    try {
      const productIds = await deleteJSON<string[]>("/api/saved-products");
      set({ productIds, requiresAuth: false });
      useToastStore.getState().showToast("Saved products cleared");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        set({ requiresAuth: true });
        useToastStore.getState().showToast(SIGN_IN_REQUIRED_MESSAGE);
      } else {
        throw err;
      }
    }
  },
}));
