"use client";

import { useToastStore } from "@/lib/store/toast-store";
import { Toast } from "@/components/ui/Toast";

/** Mounted once in app/[locale]/layout.tsx so any screen can trigger a toast. */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} />
      ))}
    </div>
  );
}
