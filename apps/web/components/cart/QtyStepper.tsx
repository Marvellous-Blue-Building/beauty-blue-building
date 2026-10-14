export function QtyStepper({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-[7px] rounded-[20px] border border-border bg-surface-2 px-1 py-[3px]">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, quantity - 1))}
        className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-surface text-[12px] font-extrabold text-text"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="min-w-3 text-center font-mono text-[11.5px] font-bold text-text tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-surface text-[12px] font-extrabold text-text"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
