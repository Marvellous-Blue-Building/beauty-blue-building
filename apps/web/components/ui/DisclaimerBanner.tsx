import type { ReactNode } from "react";

export function DisclaimerBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex gap-[9px] rounded-xl border border-warn bg-warn-dim px-[13px] py-[11px] text-[11px] leading-relaxed text-warn">
      <span>⚠</span>
      <span>{children}</span>
    </div>
  );
}
