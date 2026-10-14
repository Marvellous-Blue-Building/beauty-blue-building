import { create } from "zustand";
import { TOAST_DURATION_MS } from "@/lib/constants";

export interface ToastItem {
  id: string;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (message: string) => void;
  dismissToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  showToast: (message: string) => {
    const id = `toast-${nextId++}`;
    set({ toasts: [...get().toasts, { id, message }] });
    setTimeout(() => get().dismissToast(id), TOAST_DURATION_MS);
  },
  dismissToast: (id: string) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
