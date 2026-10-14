export function StatRow({
  stats,
}: {
  stats: { value: number | null; label: string }[];
}) {
  return (
    <div className="mb-[18px] flex gap-[10px]">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex-1 rounded-xl border border-border bg-surface p-[11px] text-center"
        >
          <div className="font-mono text-[18px] font-extrabold text-primary tabular-nums">
            {stat.value ?? "—"}
          </div>
          <div className="mt-[3px] text-[9px] tracking-[0.4px] text-text-muted uppercase">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}
