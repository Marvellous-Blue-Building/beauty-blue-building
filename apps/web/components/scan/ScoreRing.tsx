import { useTranslations } from "next-intl";

export function ScoreRing({ score }: { score: number }) {
  const t = useTranslations("diagnostic");
  const fraction = Math.max(0, Math.min(1, score / 100));

  return (
    <div
      className="mx-auto mb-4 flex h-[118px] w-[118px] items-center justify-center rounded-full shadow-[0_0_0_1px_var(--color-border)]"
      style={{
        background: `conic-gradient(var(--color-mint) 0turn, var(--color-secondary) ${fraction}turn, var(--color-surface-2) ${fraction}turn)`,
      }}
    >
      <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-app-bg">
        <div className="font-mono text-[26px] font-bold text-canvas-ink tabular-nums">
          {Math.round(score)}
        </div>
        <div className="mt-0.5 text-[8.5px] tracking-[0.4px] text-canvas-ink-muted uppercase">
          {t("overall")}
        </div>
      </div>
    </div>
  );
}
