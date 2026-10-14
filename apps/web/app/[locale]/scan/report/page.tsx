"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ScoreRing } from "@/components/scan/ScoreRing";
import { ZoneMap } from "@/components/scan/ZoneMap";
import { MetricBar } from "@/components/scan/MetricBar";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { buttonClassName } from "@/components/ui/Button";
import { useScanStore } from "@/lib/store/scan-store";
import { postJSON } from "@/lib/api-client";

export default function ScanReportPage() {
  const t = useTranslations("diagnostic");
  const router = useRouter();
  const result = useScanStore((s) => s.result);
  const imageDataUrl = useScanStore((s) => s.imageDataUrl);
  const origin = useScanStore((s) => s.origin);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  if (!result) {
    return (
      <ScreenContainer className="items-center justify-center gap-4 text-center">
        <h2 className="font-display text-[22px] font-semibold text-canvas-ink">
          {t("noReportTitle")}
        </h2>
        <p className="text-[12.5px] leading-relaxed text-canvas-ink-muted">
          {t("noReportSubtitle")}
        </p>
        <Link href="/scan" className={buttonClassName({ className: "block w-full" })}>
          {t("retakeScan")}
        </Link>
      </ScreenContainer>
    );
  }

  // Weekly "Recheck Your Skin" scans commit the photo to the user's history
  // here, rather than continuing into the onboarding questionnaire like a
  // first-time baseline scan does.
  const isCheckIn = origin === "checkin";

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await postJSON("/api/scan-result", { report: result, imageBase64: imageDataUrl });
      router.push("/progress");
    } catch {
      setSubmitting(false);
      setSubmitError(true);
    }
  }

  return (
    <ScreenContainer>
      <div className="mb-2 text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("stepLabel")}
      </div>
      <ScoreRing score={result.overall} />
      <ZoneMap zones={result.flaggedZones} imageSrc={imageDataUrl} />
      <MetricBar label={t("hydration")} value={result.hydration} />
      <MetricBar label={t("elasticity")} value={result.elasticity} />
      <MetricBar label={t("pigmentation")} value={result.pigmentation} />
      <MetricBar label={t("texture")} value={result.texture} />
      <MetricBar label={t("pores")} value={result.pores} />
      <DisclaimerBanner>{t("disclaimer")}</DisclaimerBanner>
      <div className="flex-1" />
      {submitError && (
        <p className="mb-2 text-center text-[11px] text-warn">{t("submitError")}</p>
      )}
      <div className="flex gap-2.5">
        <Link
          href={isCheckIn ? "/progress/check-in" : "/scan"}
          className={buttonClassName({ variant: "ghost", className: "flex-1" })}
        >
          {t("retakeScan")}
        </Link>
        {isCheckIn ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={buttonClassName({ className: "flex-1", disabled: submitting })}
          >
            {submitting ? t("submitting") : t("submitScan")}
          </button>
        ) : (
          <Link
            href="/quiz/skin-type"
            className={buttonClassName({ className: "flex-1" })}
          >
            {t("continueProfile")}
          </Link>
        )}
      </div>
    </ScreenContainer>
  );
}
