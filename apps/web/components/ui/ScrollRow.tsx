import type { ReactNode } from "react";

export function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar mb-4 -mx-4 flex gap-[10px] overflow-x-auto px-4 pb-2">
      {children}
    </div>
  );
}
