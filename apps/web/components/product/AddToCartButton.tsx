"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types/product";

/** Small full-width text button — used on catalog/product cards (not the detail screen's primary CTA). */
export function AddToCartButton({ product }: { product: Product }) {
  const inCart = useCartStore((s) => s.items.some((i) => i.productId === product.id));
  const addToCart = useCartStore((s) => s.addToCart);
  const t = useTranslations("shop");

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(product.id, product.name);
      }}
      className={cn(
        "mt-2 block w-full rounded-[20px] border px-2 py-[7px] text-center text-[11px] font-bold",
        inCart ? "border-primary bg-primary text-surface" : "border-primary bg-transparent text-primary"
      )}
    >
      {inCart ? t("added") : t("addToCart")}
    </button>
  );
}
