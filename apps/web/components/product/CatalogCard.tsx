import type { Product } from "@/types/product";
import { Link } from "@/i18n/navigation";
import { SaveButton } from "@/components/product/SaveButton";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductImage";
import { formatCurrency, formatPercent, discountPercent } from "@/lib/format";

/** Grid card — used in the full Browse Catalog grid. */
export function CatalogCard({ product }: { product: Product }) {
  // Only shown for real multi-variant product lines (>1 color/size variant
  // under the same parent_sku) — a single stray row with a discount is more
  // likely a data artifact than a real markdown.
  const discount = product.variantCount > 1 ? discountPercent(product.price, product.listedPrice) : null;

  return (
    <Link
      href={`/product/${product.id}`}
      className="relative min-w-0 rounded-[14px] border border-border bg-surface p-[11px]"
    >
      <SaveButton productId={product.id} />
      <ProductImage src={product.imageUrl} alt={product.name} className="mb-[9px] h-[86px] w-full rounded-[10px]" sizes="(max-width: 480px) 50vw, 200px" />
      {discount != null && (
        <span className="absolute top-[11px] left-[11px] rounded-md bg-warn px-[6px] py-[2px] font-mono text-[9.5px] font-extrabold text-surface">
          −{discount}%
        </span>
      )}
      <div className="truncate text-[12px] font-bold text-text">{product.name}</div>
      <div className="mt-[5px] flex items-baseline gap-[6px]">
        <span className="font-mono text-[12px] font-extrabold text-text">{formatCurrency(product.price)}</span>
        {discount != null && (
          <span className="font-mono text-[10px] text-text-faint line-through">
            {formatCurrency(product.listedPrice as number)}
          </span>
        )}
      </div>
      {product.matchPercent != null && (
        <div className="mt-[5px] inline-block rounded-lg bg-mint px-2 py-[3px] font-mono text-[10px] font-extrabold text-text">
          {formatPercent(product.matchPercent)} MATCH
        </div>
      )}
      {product.tags.length > 0 && (
        <div className="mt-[3px] text-[9px] font-semibold tracking-[0.2px] text-text-muted">
          {product.tags.join(" · ").toUpperCase()}
        </div>
      )}
      <AddToCartButton product={product} />
    </Link>
  );
}
