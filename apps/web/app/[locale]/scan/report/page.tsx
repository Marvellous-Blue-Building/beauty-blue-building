"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { BeautyProfile } from "@/components/scan/BeautyProfile";
import { VisualMeasurements } from "@/components/scan/VisualMeasurements";
import { buttonClassName } from "@/components/ui/Button";
import { useScanStore } from "@/lib/store/scan-store";

export default function ScanReportPage() {
  const t = useTranslations("diagnostic");
  const result = useScanStore(s => s.result);
  const origin = useScanStore(s => s.origin);
  const beauty = useScanStore(s => s.beauty);
  const poseThumbs = useScanStore(s => s.poseThumbs);
  const isCheckIn = origin === "checkin";

  if (!result) return <ScreenContainer className="items-center justify-center gap-4 text-center">
    <h2 className="font-display text-[22px] font-semibold">{t("noReportTitle")}</h2>
    <p className="text-[12.5px] text-canvas-ink-muted">{t("noReportSubtitle")}</p>
    <Link href="/scan" className={buttonClassName({ className: "block w-full" })}>{t("retakeScan")}</Link>
  </ScreenContainer>;

  return <ScreenContainer>
    <VisualMeasurements report={result} />
    {beauty && <BeautyProfile beauty={beauty} thumbs={poseThumbs} />}
    <p className="my-4 rounded-xl bg-surface-2 p-3 text-[11px] text-canvas-ink-muted">{t("disclaimer")}</p>
    <section className="mb-3 rounded-[22px] bg-primary p-4 text-surface">
      <h3 className="font-display text-[16px] font-semibold">{isCheckIn ? t("checkinNextTitle") : t("nextTitle")}</h3>
      <p className="mt-1 text-[12px] leading-relaxed">{isCheckIn ? t("checkinNextBody") : t("nextBody")}</p>
      <Link href="/quiz/skin-type" className="mt-3 block rounded-full bg-surface py-3 text-center text-[13px] font-bold text-primary">
        {isCheckIn ? t("submitScan") : t("continueProfile")}
      </Link>
    </section>
    <Link href={isCheckIn ? "/progress/check-in" : "/scan"} className={buttonClassName({ variant: "ghost", className: "block w-full" })}>{t("retakeScan")}</Link>
  </ScreenContainer>;
}
