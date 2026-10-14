import type { MetricKey } from "@/lib/scan/score-bands";

// Simple line icons, one per score, drawn with currentColor.
const PATHS: Record<MetricKey, string> = {
  hydration: "M12 3.5c3 3.6 5.5 6.7 5.5 9.8a5.5 5.5 0 0 1-11 0c0-3.1 2.5-6.2 5.5-9.8Z",
  elasticity: "M3 12c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0 3.6-3 4.8-1.5",
  pigmentation:
    "M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  texture: "M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 13c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0",
  pores:
    "M7 7h.01M12 7h.01M17 7h.01M7 12h.01M12 12h.01M17 12h.01M7 17h.01M12 17h.01M17 17h.01",
};

export function MetricIcon({ metric, className }: { metric: MetricKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={metric === "pores" ? 3.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[metric]} />
    </svg>
  );
}
