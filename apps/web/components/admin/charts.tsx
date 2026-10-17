"use client";

import { useId, useRef, useState } from "react";

/**
 * Lightweight SVG charts for the admin glass dashboard — no chart library.
 * Colors come from the admin palette (docs/admin-ui-guidelines.md).
 */

type Pt = [number, number];

/**
 * Catmull-Rom → cubic Bézier, for the soft curves in the reference design.
 * Control points are clamped to the data's vertical range so a spike after a
 * flat run never dips the curve below zero.
 */
function smoothPath(points: Pt[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const cy = (y: number) => Math.min(hi, Math.max(lo, y));
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * t, cy(p1[1] + (p2[1] - p0[1]) * t)];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * t, cy(p2[1] - (p3[1] - p1[1]) * t)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function toPoints(values: number[], w: number, h: number, max: number, padTop = 4, padBottom = 4): Pt[] {
  const n = Math.max(values.length - 1, 1);
  return values.map((v, i) => [(i / n) * w, padTop + (1 - v / (max || 1)) * (h - padTop - padBottom)]);
}

export function Sparkline({ values, color, width = 140, height = 76 }: { values: number[]; color: string; width?: number; height?: number }) {
  const id = useId();
  const max = Math.max(...values, 1);
  const pts = toPoints(values, width, height, max, 8, 6);
  const line = smoothPath(pts);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export interface Series {
  label: string;
  color: string;
  values: number[];
}

/** Two-series area/line chart with a glass hover tooltip (the "Sales Report" panel). */
export function AreaLineChart({
  labels,
  tooltipLabels,
  series,
  height = 260,
}: {
  labels: string[];
  tooltipLabels: string[];
  series: Series[];
  height?: number;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const n = labels.length;
  const rawMax = Math.max(...series.flatMap((s) => s.values), 0);
  const max = rawMax <= 4 ? 4 : Math.ceil(rawMax * 1.15);
  const gridLines = 4;

  function onMove(e: React.MouseEvent) {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(x * (n - 1)))));
  }

  const hoverX = hover == null ? 0 : (hover / Math.max(n - 1, 1)) * 100;
  // Show at most ~12 axis labels so 30-day ranges stay legible.
  const step = Math.max(1, Math.ceil(n / 12));

  return (
    <div>
      <div ref={wrapRef} className="relative" style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`area-${id}-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {Array.from({ length: gridLines + 1 }, (_, i) => (
            <line key={i} x1="0" x2={W} y1={(i / gridLines) * H} y2={(i / gridLines) * H} stroke="rgb(31 41 55 / 0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s, i) => {
            const line = smoothPath(toPoints(s.values, W, H, max, 6, 2));
            return (
              <g key={i}>
                <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#area-${id}-${i})`} />
                <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>

        {hover != null && (
          <>
            <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-admin-accent/70" style={{ left: `${hoverX}%` }} />
            {series.map((s, i) => {
              const v = s.values[hover] ?? 0;
              const top = 6 + (1 - v / (max || 1)) * (H - 8);
              return (
                <span
                  key={i}
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{ left: `${hoverX}%`, top, background: s.color }}
                />
              );
            })}
            <div
              className="glass-panel pointer-events-none absolute top-6 z-10 w-48 rounded-2xl p-3 text-xs"
              style={hoverX > 60 ? { right: `calc(${100 - hoverX}% + 12px)` } : { left: `calc(${hoverX}% + 12px)` }}
            >
              <div className="mb-2 font-semibold uppercase tracking-wide text-admin-ink-muted">{tooltipLabels[hover]}</div>
              {series.map((s, i) => (
                <div key={i} className="flex items-center justify-between border-l-2 py-1 pl-2" style={{ borderColor: s.color }}>
                  <span className="text-admin-ink-muted">{s.label}</span>
                  <span className="font-semibold text-admin-ink">{(s.values[hover] ?? 0).toLocaleString("id-ID")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-between text-xs text-admin-ink-muted">
        {labels.map((l, i) => (
          <span key={i} className={i % step === 0 || i === n - 1 ? "" : "invisible w-0 overflow-hidden"}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Overlapping proportional circles (the "Total Bets" panel). Largest value sits left. */
export function BubbleChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  // Area ∝ share, with a floor so tiny shares stay readable. Smaller bubbles
  // straddle the big one's right edge, as in the reference design.
  const radius = (v: number, floor: number) => Math.max(floor, Math.sqrt(v / total) * 115);
  const [a, b, c] = sorted;
  const ra = radius(a?.value ?? 0, 60);
  const rb = radius(b?.value ?? 0, 38);
  const rc = radius(c?.value ?? 0, 32);
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const at = (r: number, deg: number, dist: number) => ({ cx: 125 + Math.cos((deg * Math.PI) / 180) * dist, cy: 130 + Math.sin((deg * Math.PI) / 180) * dist, r });
  const circles = [
    a && { ...a, cx: 125, cy: 130, r: ra },
    b && { ...b, ...at(rb, -38, ra + rb * 0.15) },
    c && { ...c, ...at(rc, 34, ra - rc * 0.05) },
  ].filter(Boolean) as { label: string; value: number; color: string; r: number; cx: number; cy: number }[];

  return (
    <svg viewBox="0 0 320 260" className="mx-auto h-auto w-full max-w-[320px]" role="img" aria-label={sorted.map((s) => `${s.label} ${pct(s.value)}`).join(", ")}>
      {circles.map((s, i) => (
        <g key={i}>
          <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.color} opacity={0.95} />
          <text x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight={600} fontSize={Math.max(12, s.r / 3.2)}>
            {pct(s.value)}
          </text>
        </g>
      ))}
    </svg>
  );
}
