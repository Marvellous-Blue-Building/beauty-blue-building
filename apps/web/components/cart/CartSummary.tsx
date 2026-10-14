import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";

export function CartSummary({ subtotal }: { subtotal: number }) {
  const t = useTranslations("cart");

  return (
    <div className="mt-[6px] rounded-[14px] border border-border bg-surface p-[14px]">
      <div className="mb-[9px] flex justify-between text-[12.5px] text-text-muted">
        <span>{t("subtotal")}</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      <div className="mb-[9px] flex justify-between text-[12.5px] text-text-muted">
        <span>{t("shipping")}</span>
        <span>{t("free")}</span>
      </div>
      <div className="mt-0.5 flex justify-between border-t border-border pt-[11px] font-mono text-[14px] font-extrabold text-text">
        <span>{t("total")}</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
    </div>
  );
}
