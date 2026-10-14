import type { MatchedRoutineStep } from "@/types/routine";
import { Link } from "@/i18n/navigation";
import { ProductImage } from "@/components/product/ProductImage";

export function RoutineCard({
  step,
  clickable = true,
}: {
  step: MatchedRoutineStep;
  /** false for a guest on the locked Your Routine screen — the journey stops here. */
  clickable?: boolean;
}) {
  const { product } = step;

  const content = (
    <>
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[12px] font-extrabold text-surface">
        {step.stepNumber}
      </span>
      <ProductImage src={product.imageUrl} alt={product.name} className="h-11 w-11 shrink-0 rounded-[10px]" sizes="44px" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-text">{product.name}</span>
        <span className="mt-[3px] block text-[11px] leading-snug text-text-muted">{step.why}</span>
      </span>
      {clickable && <span className="text-[17px] text-text-faint">›</span>}
    </>
  );

  if (!clickable) {
    return (
      <div className="mb-[10px] flex items-center gap-3 rounded-[14px] border border-border bg-surface p-[13px] opacity-80">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/product/${product.parentSku}?variant=${product.id}`}
      className="mb-[10px] flex items-center gap-3 rounded-[14px] border border-border bg-surface p-[13px]"
    >
      {content}
    </Link>
  );
}
