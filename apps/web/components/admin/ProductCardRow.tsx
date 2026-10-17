"use client";

import clsx from "clsx";
import { useState } from "react";
import { useLocale } from "next-intl";
import { IconSparkle } from "./icons";

export interface ProductCardData {
  id?: string;
  name: string;
  brand: string | null;
  price: number | string | null;
  listedPrice?: number | string | null;
  rating?: number | string | null;
  totalReview?: number | null;
  imageUrl?: string | null;
}

function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-admin-accent/70">
        <IconSparkle size={22} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- remote retailer CDN, not in next/image remotePatterns
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
}

/**
 * Swipeable row of recommended-product cards (photo, brand, name, rating,
 * price + struck-through list price) — the admin-glass counterpart of the
 * widget's product cards in public/widget-loader.js.
 */
export function ProductCardRow({ products, className }: { products: ProductCardData[]; className?: string }) {
  const tag = useLocale() === "id" ? "id-ID" : "en-US";
  if (products.length === 0) return null;
  const rp = (v: number) => `Rp ${Math.round(v).toLocaleString(tag)}`;

  return (
    <div className={clsx("no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1", className)}>
      {products.slice(0, 6).map((p, i) => {
        const price = Number(p.price);
        const listed = Number(p.listedPrice);
        const discounted = listed > price && price > 0;
        const rating = Number(p.rating);
        return (
          <div key={p.id ?? i} className="flex w-36 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/75 text-neutral-700 shadow-[0_8px_18px_-14px_rgb(64_64_64/0.5)]">
            <div className="relative aspect-square bg-admin-blush/50">
              <ProductImage src={p.imageUrl} alt={p.name} />
              {discounted && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-admin-accent px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                  -{Math.round((1 - price / listed) * 100)}%
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-2.5">
              {p.brand && <div className="truncate text-[9.5px] uppercase tracking-wide text-neutral-500">{p.brand}</div>}
              <div className="line-clamp-2 min-h-[31px] text-xs font-semibold leading-snug" title={p.name}>
                {p.name}
              </div>
              {rating > 0 && (
                <div className="text-[10.5px] text-neutral-500">
                  <span className="font-semibold text-admin-warning">★ {rating.toFixed(1)}</span>
                  {p.totalReview ? ` (${p.totalReview.toLocaleString(tag)})` : ""}
                </div>
              )}
              {price > 0 && (
                <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1">
                  <span className="text-[12.5px] font-semibold">{rp(price)}</span>
                  {discounted && <s className="text-[10px] text-neutral-500">{rp(listed)}</s>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
