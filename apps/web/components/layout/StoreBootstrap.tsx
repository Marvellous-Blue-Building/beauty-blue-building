"use client";

import { useEffect } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useSavedStore } from "@/lib/store/saved-store";
import { useAuthStore } from "@/lib/store/auth-store";

/** Loads cart/saved/session state from the real API once on app mount. */
export function StoreBootstrap() {
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchSaved = useSavedStore((s) => s.fetchSaved);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchCart();
    fetchSaved();
    fetchUser();
  }, [fetchCart, fetchSaved, fetchUser]);

  return null;
}
