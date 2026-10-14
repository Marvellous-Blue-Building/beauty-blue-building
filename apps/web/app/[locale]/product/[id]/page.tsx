"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { InciTagList } from "@/components/product/InciTagList";
import { CompatRow } from "@/components/product/CompatRow";
import { SaveButtonLabel } from "@/components/product/SaveButtonLabel";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { Button, buttonClassName } from "@/components/ui/Button";
import { ProductImage } from "@/components/product/ProductImage";
import { getJSON } from "@/lib/api-client";
import { useCartStore } from "@/lib/store/cart-store";
import { useQuizStore } from "@/lib/store/quiz-store";
import { flagIngredients } from "@/lib/rag/sensitivity-flags";
import { formatCurrency, discountPercent } from "@/lib/format";
import type { Product } from "@/types/product";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const t = useTranslations("product");
  const addToCart = useCartStore((s) => s.addToCart);
  const inCart = useCartStore((s) => s.items.some((i) => i.productId === id));
  const sensitivities = useQuizStore((s) => s.sensitivities);

  useEffect(() => {
    getJSON<Product>(`/api/products/${id}`)
      .then(setProduct)
      .catch(() => setProduct(null));
  }, [id]);

  if (product === undefined) return null;
  if (product === null) notFound();

  // Flagged live against the viewer's own declared sensitivities — not a
  // fixed property of the product.
  const flaggedInci = flagIngredients(
    product.inci.map((i) => i.name),
    sensitivities
  );
  const flaggedIngredient = flaggedInci.find((i) => i.flagged);
  const discount = product.variantCount > 1 ? discountPercent(product.price, product.listedPrice) : null;

  return (
    <ScreenContainer>
      <ProductImage src={product.imageUrl} alt={product.name} className="mb-4 h-[170px] w-full rounded-2xl border border-border" sizes="480px" />
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
      <Button
        onClick={() => addToCart(product.id, product.name)}
        added={inCart}
        className="mb-2.5 w-full"
      >
        {inCart ? t("added") : `${t("addToCart")} — ${formatCurrency(product.price)}`}
      </Button>
      <div className="flex gap-2.5">
        <Link href="/shop" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
          {t("viewAlternatives")}
        </Link>
        <Link href="/routine" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
          {t("backToRoutine")}
        </Link>
      </div>
    </ScreenContainer>
  );
}
