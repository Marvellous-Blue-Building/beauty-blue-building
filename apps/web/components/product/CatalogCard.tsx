import type { Product } from "@/types/product";
import { Link } from "@/i18n/navigation";
import { SaveButton } from "@/components/product/SaveButton";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductImage";
import { formatCurrency, formatPercent, discountPercent } from "@/lib/format";
import { productHref } from "@/lib/product-href";
import { cn } from "@/lib/cn";

/** Grid card — used in the full Browse Catalog grid. `compact` scales
 * every piece of content down for the 130px-wide chat product list (see
 * ChatProductList) instead of the default ~170-180px grid cell. `fromChat`
 * tags the link so the product detail screen's "View Alternatives" goes
 * back to the chat instead of /shop (see app/[locale]/product/[id]/page.tsx). */
export function CatalogCard({
  product,
  compact = false,
  fromChat = false,
}: {
  product: Product;
  compact?: boolean;
  fromChat?: boolean;
}) {
  // Only shown for real multi-variant product lines (>1 color/size variant
  // under the same parent_sku) — a single stray row with a discount is more
  // likely a data artifact than a real markdown.
  const discount = product.variantCount > 1 ? discountPercent(product.price, product.listedPrice) : null;

  const href = productHref(product, { fromChat });

  return (
    <Link
      href={href}
      className={cn(
        "relative block h-full min-w-0 rounded-[14px] border border-border bg-surface",
        compact ? "p-[7px]" : "p-[11px]"
      )}
    >
      <SaveButton productId={product.id} compact={compact} />
      <ProductImage
        src={product.imageUrl}
        alt={product.name}
        className={cn("w-full rounded-[10px]", compact ? "mb-[6px] h-[64px]" : "mb-[9px] h-[86px]")}
        sizes={compact ? "130px" : "(max-width: 480px) 50vw, 200px"}
      />
      {discount != null && (
        <span
          className={cn(
            "absolute rounded-md bg-warn font-mono font-extrabold text-surface",
            compact ? "top-[7px] left-[7px] px-[4px] py-[1px] text-[8px]" : "top-[11px] left-[11px] px-[6px] py-[2px] text-[9.5px]"
          )}
        >
          −{discount}%
        </span>
      )}
      <div className={cn("truncate font-bold text-text", compact ? "text-[10px]" : "text-[12px]")}>
        {product.name}
      </div>
      {product.variantCount > 1 && product.colorPalette.length > 0 && (
        <div className={cn("flex items-center gap-[4px]", compact ? "mt-[2px]" : "mt-[3px]")}>
          {product.colorPalette.slice(0, 5).map((hex) => (
            <span
              key={hex}
              className={cn("shrink-0 rounded-full border border-border", compact ? "h-[9px] w-[9px]" : "h-[12px] w-[12px]")}
              style={{ backgroundColor: hex }}
            />
          ))}
          {product.colorPalette.length > 5 && (
            <span className={cn("text-text-faint", compact ? "text-[7px]" : "text-[8.5px]")}>
              +{product.colorPalette.length - 5}
            </span>
          )}
        </div>
      )}
      <div className={cn("flex items-baseline gap-[6px]", compact ? "mt-[3px]" : "mt-[5px]")}>
        <span className={cn("font-mono font-extrabold text-text", compact ? "text-[10px]" : "text-[12px]")}>
          {formatCurrency(product.price)}
        </span>
        {discount != null && (
          <span className={cn("font-mono text-text-faint line-through", compact ? "text-[8.5px]" : "text-[10px]")}>
            {formatCurrency(product.listedPrice as number)}
          </span>
        )}
      </div>
      {product.matchPercent != null && (
        <div
          className={cn(
            "inline-block rounded-lg bg-mint font-mono font-extrabold text-text",
            compact ? "mt-[3px] px-1.5 py-[2px] text-[8.5px]" : "mt-[5px] px-2 py-[3px] text-[10px]"
          )}
        >
          {formatPercent(product.matchPercent)} MATCH
        </div>
      )}
      {product.tags.length > 0 && (
        <div
          className={cn(
            "truncate font-semibold tracking-[0.2px] text-text-muted",
            compact ? "mt-[2px] text-[7.5px]" : "mt-[3px] text-[9px]"
          )}
        >
          {product.tags.join(" · ").toUpperCase()}
        </div>
      )}
      <AddToCartButton product={product} compact={compact} />
    </Link>
  );
}
