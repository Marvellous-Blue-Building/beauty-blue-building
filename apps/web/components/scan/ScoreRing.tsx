"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const STROKE = 9;

/** Counts from 0 up to `target` once, unless the user prefers reduced motion. */
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

export function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const t = useTranslations("diagnostic");
  const shown = useCountUp(Math.round(score));
  const radius = (size - STROKE) / 2;
  const length = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, score / 100));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="score-ring-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-mint)" />
            <stop offset="100%" stopColor="var(--color-secondary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={STROKE}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#score-ring-fill)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
          className="animate-[ring-fill_1s_ease-out]"
          style={{ ["--ring-length" as string]: length }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[30px] leading-none font-bold text-canvas-ink tabular-nums">
          {shown}
        </div>
        <div className="mt-1 text-[9px] tracking-[0.4px] text-canvas-ink-muted uppercase">
          {t("outOf100")}
        </div>
      </div>
    </div>
  );
}
