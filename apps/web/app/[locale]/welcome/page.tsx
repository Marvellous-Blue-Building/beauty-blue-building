"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { buttonClassName } from "@/components/ui/Button";

export default function WelcomePage() {
  const t = useTranslations("welcome");

  return (
    <ScreenContainer>
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] text-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-mint to-secondary font-display text-[28px] font-semibold text-surface shadow-[0_0_44px_-6px_rgba(224,169,150,0.6)]">
          AI
        </div>
        <div>
          <h2 className="font-display text-[22px] font-semibold text-canvas-ink">{t("title")}</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-canvas-ink-muted">
            {t("subtitle")}
          </p>
        </div>
      </div>
      <Link href="/scan" className={buttonClassName({ className: "block w-full" })}>
        {t("startScan")}
      </Link>
    </ScreenContainer>
  );
}
