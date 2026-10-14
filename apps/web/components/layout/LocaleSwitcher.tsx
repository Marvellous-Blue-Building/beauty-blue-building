"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const DEFAULT_LOCALE_LABELS: Record<string, string> = {
  en: "EN",
  id: "ID",
};

export function LocaleSwitcher({ labels }: { labels?: Record<string, string> }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const localeLabels = labels ?? DEFAULT_LOCALE_LABELS;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div className="relative shrink-0">
      <select
        value={locale}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Change language"
        className="h-[30px] appearance-none rounded-full border border-border bg-surface pl-2.5 pr-5 font-mono text-[10px] font-bold uppercase tracking-[0.3px] text-text disabled:opacity-60"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {localeLabels[l] ?? l}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-text-faint">
        ▾
      </span>
    </div>
  );
}
