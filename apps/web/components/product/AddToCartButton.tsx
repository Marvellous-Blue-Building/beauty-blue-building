"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types/product";

/** Small full-width text button — used on catalog/product cards (not the
 * detail screen's primary CTA). `compact` shrinks it for the 130px-wide
 * chat product list (see ChatProductList). */
export function AddToCartButton({ product, compact = false }: { product: Product; compact?: boolean }) {
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
        "block w-full truncate rounded-[20px] border text-center font-bold",
        compact ? "mt-1.5 px-1.5 py-[5px] text-[9.5px]" : "mt-2 px-2 py-[7px] text-[11px]",
        inCart ? "border-primary bg-primary text-surface" : "border-primary bg-transparent text-primary"
      )}
    >
      {inCart ? t("added") : t("addToCart")}
    </button>
  );
}
