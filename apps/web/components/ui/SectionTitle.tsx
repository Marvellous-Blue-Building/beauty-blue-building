import type { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
  action?: ReactNode;
  onActionClick?: () => void;
}

export function SectionTitle({ children, action, onActionClick }: SectionTitleProps) {
  return (
    <div className="mt-1 mb-[11px] flex items-center justify-between text-[12px] font-bold tracking-[0.8px] text-canvas-ink uppercase">
      <span>{children}</span>
      {action && (
        <span
          onClick={onActionClick}
          className="cursor-pointer text-[10.5px] font-semibold text-canvas-ink-muted normal-case"
        >
          {action}
        </span>
      )}
    </div>
  );
}
