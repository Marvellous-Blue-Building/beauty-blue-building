"use client";

import { useEffect, useState } from "react";
import type { ChatRecommendation } from "@/types/chat";
import type { Product } from "@/types/product";
import { getJSON } from "@/lib/api-client";
import { ProductImage } from "@/components/product/ProductImage";

export function ChatRecCard({ recommendation }: { recommendation: ChatRecommendation }) {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    getJSON<Product>(`/api/products/${recommendation.productId}`).then(setProduct);
  }, [recommendation.productId]);

  if (!product) return null;

  return (
    <div className="ml-9 max-w-[220px] rounded-2xl border border-secondary bg-surface p-[11px] shadow-[0_0_28px_-12px_rgba(224,169,150,0.5)]">
      <div className="mb-[7px] inline-block rounded-lg bg-mint px-2 py-[3px] text-[9px] font-extrabold tracking-[0.6px] text-text uppercase">
        {recommendation.badge}
      </div>
      <ProductImage src={product.imageUrl} alt={product.name} className="mb-[7px] h-[60px] w-full rounded-[9px]" sizes="200px" />
      <div className="truncate text-[12px] font-bold text-text">{product.name}</div>
      <div className="mt-1 text-[9.5px] text-text-muted">
        {product.inci.slice(0, 2).map((i) => i.name).join(" · ")}
      </div>
    </div>
  );
}
