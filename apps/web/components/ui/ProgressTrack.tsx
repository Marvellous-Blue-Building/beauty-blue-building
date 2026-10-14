export function ProgressTrack({ percent }: { percent: number }) {
  return (
    <div className="mb-4 h-[5px] overflow-hidden rounded bg-surface-2">
      <div
        className="h-full rounded bg-primary transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
