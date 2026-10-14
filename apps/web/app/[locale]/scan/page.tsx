"use client";

import { useTranslations } from "next-intl";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { NativeSkinScanEngine } from "@/components/scan/NativeSkinScanEngine";

export default function ScanPage() {
  const t = useTranslations("scan");

  return (
    <ScreenContainer>
      <div className="mb-2 text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepLabel")}
      </div>
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("subtitle")}
      </p>
      <NativeSkinScanEngine />
    </ScreenContainer>
  );
}
