import type { Product } from "@/types/product";
import { Link } from "@/i18n/navigation";
import { SaveButton } from "@/components/product/SaveButton";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductImage";
import { formatPercent, discountPercent } from "@/lib/format";

/** Horizontal scroll card — used in "Matched to Your Scan" rows. */
export function ProductCard({ product }: { product: Product }) {
  // Only shown for real multi-variant product lines (>1 color/size variant
  // under the same parent_sku) — a single stray row with a discount is more
  // likely a data artifact than a real markdown.
  const discount = product.variantCount > 1 ? discountPercent(product.price, product.listedPrice) : null;

  return (
    <Link
      href={`/product/${product.parentSku}?variant=${product.id}`}
      className="relative w-[132px] shrink-0 rounded-[14px] border border-border bg-surface p-[11px]"
    >
      <SaveButton productId={product.id} />
      <ProductImage src={product.imageUrl} alt={product.name} className="mb-[9px] h-[72px] w-full rounded-[10px]" sizes="132px" />
      {discount != null && (
        <span className="absolute top-[11px] left-[11px] rounded-md bg-warn px-[6px] py-[2px] font-mono text-[9.5px] font-extrabold text-surface">
          −{discount}%
        </span>
      )}
      <div className="truncate text-[12px] leading-snug font-bold text-text">{product.name}</div>
      <div className="mt-[3px] text-[10px] text-text-muted">
        {product.brand}{product.sizeLabel ? ` · ${product.sizeLabel}` : ""}
      </div>
      {product.matchPercent != null && (
        <div className="mt-[5px] inline-block rounded-lg bg-mint px-2 py-[3px] font-mono text-[10px] font-extrabold text-text">
          {formatPercent(product.matchPercent)} MATCH
        </div>
      )}
      <AddToCartButton product={product} />
    </Link>
  );
}
