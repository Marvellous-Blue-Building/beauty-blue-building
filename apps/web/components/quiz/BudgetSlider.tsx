"use client";

interface BudgetSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function BudgetSlider({ value, onChange, min, max }: BudgetSliderProps) {
  const step = Math.max(1000, Math.round((max - min) / 100 / 1000) * 1000);

  return (
    <div className="mb-[18px]">
      <div className="mb-[7px] flex justify-between text-[12px] font-semibold text-canvas-ink-muted">
        <span>{rupiah.format(min)}</span>
        <span className="font-mono text-canvas-ink">{rupiah.format(value)}</span>
        <span>{rupiah.format(max)}+</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
