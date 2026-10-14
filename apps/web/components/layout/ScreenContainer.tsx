import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function ScreenContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-full flex-col px-[18px] pt-5 pb-[18px]", className)}>
      {children}
    </div>
  );
}
