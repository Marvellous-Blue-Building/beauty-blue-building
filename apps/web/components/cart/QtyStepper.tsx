export function QtyStepper({
  quantity,
  onChange,
  onRemoveConfirm,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  /** Called when user clicks (-) at quantity 1 — should open a confirmation dialog instead of setting quantity to 0. */
  onRemoveConfirm?: () => void;
}) {
  return (
    <div className="flex items-center gap-[7px] rounded-[20px] border border-border bg-surface-2 px-1 py-[3px]">
      <button
        type="button"
        onClick={() => (quantity === 1 && onRemoveConfirm ? onRemoveConfirm() : onChange(quantity - 1))}
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
