"use client";

import type { CartItem } from "@/types/cart";
import type { Product } from "@/types/product";
import { useCartStore } from "@/lib/store/cart-store";
import { QtyStepper } from "@/components/cart/QtyStepper";
import { ProductImage } from "@/components/product/ProductImage";
import { formatCurrency } from "@/lib/format";

export function CartItemRow({ item, product }: { item: CartItem; product: Product }) {
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeFromCart = useCartStore((s) => s.removeFromCart);

  return (
    <div className="mb-[10px] flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3">
      <ProductImage src={product.imageUrl} alt={product.name} className="h-[52px] w-[52px] shrink-0 rounded-[10px]" sizes="52px" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-text">{product.name}</div>
        <div className="mt-[2px] text-[10.5px] text-text-muted">
          {product.brand}{product.sizeLabel ? ` · ${product.sizeLabel}` : ""}
        </div>
        <div className="mt-[7px] flex items-center justify-between gap-2">
          <QtyStepper
            quantity={item.quantity}
            onChange={(q) => setQuantity(item.productId, q)}
          />
          <span className="whitespace-nowrap font-mono text-[12px] font-extrabold text-text">
            {formatCurrency(product.price)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => removeFromCart(item.productId)}
        aria-label="Remove from cart"
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-text-muted"
      >
        ✕
      </button>
    </div>
  );
}
