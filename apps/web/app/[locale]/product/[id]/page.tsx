"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { notFound, useSearchParams } from "next/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { InciTagList } from "@/components/product/InciTagList";
import { CompatRow } from "@/components/product/CompatRow";
import { SaveButtonLabel } from "@/components/product/SaveButtonLabel";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { Button, buttonClassName } from "@/components/ui/Button";
import { ProductImage } from "@/components/product/ProductImage";
import { ShareModal } from "@/components/product/ShareModal";
import { ShareIcon } from "@/components/product/ShareIcons";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getJSON, ApiError } from "@/lib/api-client";
import { useCartStore } from "@/lib/store/cart-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useQuizStore } from "@/lib/store/quiz-store";
import { flagIngredients } from "@/lib/rag/sensitivity-flags";
import { formatCurrency, discountPercent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { productHref } from "@/lib/product-href";
import type { Product } from "@/types/product";

/** `id` in this route is a parent_sku, not one row's own UUID — every
 * color/size variant sharing that parent_sku is fetched once up front (see
 * GET /api/products/[id]), so switching between shades/sizes below is a
 * pure client-side state change: zero network round-trip, zero reload. */
export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: parentSku } = use(params);
  const [variants, setVariants] = useState<Product[] | null | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const t = useTranslations("product");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Opened from the chat's product list (see CatalogCard's fromChat prop) —
  // "View Alternatives" should return to that conversation, not /shop.
  const fromChat = searchParams.get("from") === "chat";
  // Which exact variant to show — /product/<parentSku>?color=<hex>&size=<label>,
  // either/both/neither (see lib/product-href.ts).
  const colorParam = searchParams.get("color");
  const sizeParam = searchParams.get("size");
  const addToCart = useCartStore((s) => s.addToCart);
  const inCart = useCartStore((s) => s.items.some((i) => i.productId === selectedId));
  const sensitivities = useQuizStore((s) => s.sensitivities);
  const user = useAuthStore((s) => s.user);
  const authLoaded = useAuthStore((s) => s.loaded);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    getJSON<{ variants: Product[] }>(`/api/products/${parentSku}`)
      .then((res) => setVariants(res.variants))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) return setVariants(null);
        throw err;
      });
  }, [parentSku]);

  // Default selection, derived at render time (not via a setState-in-effect)
  // — honors the exact shade/size named in the URL (?color=/?size=, even if
  // that variant's since gone out of stock — they should see exactly what
  // they picked), otherwise prefers an in-stock variant over landing on a
  // dead one. `selectedId` only ever gets set explicitly, on a real click.
  const requestedVariant =
    variants && (colorParam || sizeParam)
      ? variants.find(
          (v) => (!colorParam || v.colorHex === colorParam) && (!sizeParam || v.sizeLabel === sizeParam)
        )
      : undefined;
  const defaultVariantId =
    variants && (requestedVariant ?? variants.find((v) => v.stockQuantity > 0) ?? variants[0])?.id;
  const product = variants?.find((v) => v.id === (selectedId ?? defaultVariantId));

  if (variants === undefined || !product) return null;
  if (variants === null) notFound();

  // Picks which sibling a shade/size click should switch to — prefers one
  // matching the OTHER currently-selected dimension too (e.g. clicking a
  // new color keeps the current size if that combination exists) — then
  // updates both local state AND the URL (shallow — no reload) so the
  // page's own URL always reflects exactly what's shown, for sharing (see
  // the share button) and for landing directly on a specific shade/size
  // from a product list.
  function selectVariant(target: Product) {
    setSelectedId(target.id);
    router.replace(productHref(target, { fromChat }), { scroll: false });
  }

  const pickByColor = (hex: string) =>
    variants.find((v) => v.colorHex === hex && v.sizeLabel === product.sizeLabel) ??
    variants.find((v) => v.colorHex === hex);
  const pickBySize = (sizeLabel: string) =>
    variants.find((v) => v.sizeLabel === sizeLabel && v.colorHex === product.colorHex) ??
    variants.find((v) => v.sizeLabel === sizeLabel);

  const distinctColors = [...new Map(variants.filter((v) => v.colorHex).map((v) => [v.colorHex as string, v])).keys()];
  const distinctSizes = [...new Set(variants.filter((v) => v.sizeLabel).map((v) => v.sizeLabel as string))];

  // Flagged live against the viewer's own declared sensitivities — not a
  // fixed property of the product.
  const flaggedInci = flagIngredients(
    product.inci.map((i) => i.name),
    sensitivities
  );
  const flaggedIngredient = flaggedInci.find((i) => i.flagged);
  const discount = product.variantCount > 1 ? discountPercent(product.price, product.listedPrice) : null;
  const outOfStock = product.stockQuantity === 0;

  return (
    <ScreenContainer>
      <div className="relative mb-4">
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="h-[170px] w-full rounded-2xl border border-border"
          sizes="480px"
          fit="contain"
        />
        <button
          type="button"
          onClick={() => setShareUrl(window.location.href)}
          aria-label={t("share")}
          className="absolute top-2.5 right-2.5 flex h-[32px] w-[32px] items-center justify-center rounded-full border border-border bg-surface text-text shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
        >
          <ShareIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-[9px] flex items-start justify-between gap-2.5">
        <h2 className="font-display text-[22px] font-semibold text-canvas-ink">{product.name}</h2>
        <SaveButtonLabel productId={product.id} />
      </div>
      <div className="mb-[9px] flex items-baseline gap-[8px]">
        <span className="font-mono text-[17px] font-bold text-text">{formatCurrency(product.price)}</span>
        {discount != null && (
          <>
            <span className="font-mono text-[12.5px] text-text-faint line-through">
              {formatCurrency(product.listedPrice as number)}
            </span>
            <span className="rounded-md bg-warn px-[6px] py-[2px] font-mono text-[10px] font-extrabold text-surface">
              −{discount}%
            </span>
          </>
        )}
      </div>
      <p className="mb-[18px] text-[12.5px] text-canvas-ink-muted">
        {product.brand}
        {product.sizeLabel ? ` · ${product.sizeLabel}` : ""}
        {product.tags.length > 0 ? ` · ${product.tags.join(" · ")}` : ""}
      </p>

      {product.colorHex && (
        <div className="mb-[18px]">
          <SectionTitle>{t("shade")}</SectionTitle>
          <div className="mb-[9px] flex items-center gap-[8px]">
            <span
              className="h-[22px] w-[22px] shrink-0 rounded-full border border-border"
              style={{ backgroundColor: product.colorHex }}
            />
            <span className="text-[12.5px] text-canvas-ink-muted">{product.colorName}</span>
          </div>
          {distinctColors.length > 1 && (
            <div className="no-scrollbar flex gap-[8px] overflow-x-auto pb-[2px]">
              {distinctColors.map((hex) => {
                const target = pickByColor(hex);
                if (!target) return null;
                const disabled = target.stockQuantity === 0;
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={target.colorName ?? hex}
                    disabled={disabled}
                    onClick={() => selectVariant(target)}
                    className={cn(
                      "h-[28px] w-[28px] shrink-0 rounded-full border-2",
                      disabled && "cursor-not-allowed opacity-30",
                      hex === product.colorHex ? "border-primary" : "border-border"
                    )}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {distinctSizes.length > 1 && (
        <div className="mb-[18px]">
          <SectionTitle>{t("size")}</SectionTitle>
          <div className="no-scrollbar flex gap-[8px] overflow-x-auto pb-[2px]">
            {distinctSizes.map((sizeLabel) => {
              const target = pickBySize(sizeLabel);
              if (!target) return null;
              const disabled = target.stockQuantity === 0;
              const active = sizeLabel === product.sizeLabel;
              return (
                <button
                  key={sizeLabel}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectVariant(target)}
                  className={cn(
                    "shrink-0 rounded-full border px-[12px] py-[6px] text-[11.5px] font-semibold",
                    disabled && "cursor-not-allowed opacity-30",
                    active ? "border-primary bg-primary-dim text-primary" : "border-border text-text-muted"
                  )}
                >
                  {sizeLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <SectionTitle>{t("whyRecommend")}</SectionTitle>
      <p className="mb-[13px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {product.description || "No description available for this product."}
      </p>

      <SectionTitle>{t("ingredientSafety")}</SectionTitle>
      <InciTagList ingredients={flaggedInci} />
      {flaggedIngredient && (
        <DisclaimerBanner>
          Contains {flaggedIngredient.name} — flagged against your sensitivity profile. Patch
          test recommended.
        </DisclaimerBanner>
      )}

      <SectionTitle>{t("layeringCompatibility")}</SectionTitle>
      {product.compatibility.map((note) => (
        <CompatRow key={note.label} note={note} />
      ))}

      <div className="flex-1" />
      {!(authLoaded && !user) ? (
        <>
          <Button
            onClick={() => addToCart(product.id, product.name)}
            added={inCart}
            disabled={outOfStock}
            className="mb-2.5 w-full"
          >
            {outOfStock
              ? t("outOfStock")
              : inCart
                ? t("added")
                : `${t("addToCart")} — ${formatCurrency(product.price)}`}
          </Button>
          <div className="flex gap-2.5">
            {fromChat ? (
              <button
                type="button"
                onClick={() => router.back()}
                className={buttonClassName({ variant: "ghost", className: "flex-1" })}
              >
                {t("viewAlternatives")}
              </button>
            ) : (
              <Link href="/shop" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
                {t("viewAlternatives")}
              </Link>
            )}
            <Link href="/routine" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
              {t("backToRoutine")}
            </Link>
          </div>
        </>
      ) : (
        // No session — the product itself stays fully visible (name, price,
        // description, ingredients, compatibility), only the cart/navigation
        // CTAs are replaced, since actually adding to cart or viewing an
        // account-tied routine both genuinely require an account.
        <GoogleSignInButton className={buttonClassName({ className: "w-full" })} onSignedIn={fetchUser}>
          Sign in with Google to access more
        </GoogleSignInButton>
      )}

      {shareUrl && <ShareModal product={product} url={shareUrl} onClose={() => setShareUrl(null)} />}
    </ScreenContainer>
  );
}
