export function MetricBar({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: number;
  displayValue?: string;
}) {
  return (
    <div className="mb-[13px]">
      <div className="mb-[6px] flex justify-between text-[12.5px] font-semibold text-canvas-ink">
        <span>{label}</span>
        <span className="font-mono text-primary tabular-nums">
          {displayValue ?? Math.round(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-md bg-surface-2">
        <div
          className="h-full rounded-md bg-gradient-to-r from-mint to-secondary"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
