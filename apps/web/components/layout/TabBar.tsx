"use client";

import { useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { RoutineIcon, ShopIcon, AdvisorIcon, ProgressIcon, ProfileIcon } from "@/components/layout/TabIcons";

const TABS = [
  { href: "/routine", labelKey: "tabRoutine", Icon: RoutineIcon },
  { href: "/shop", labelKey: "tabShop", Icon: ShopIcon },
  { href: "/chat", labelKey: "tabAdvisor", Icon: AdvisorIcon },
  { href: "/progress", labelKey: "tabProgress", Icon: ProgressIcon },
  { href: "/profile", labelKey: "tabProfile", Icon: ProfileIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex border-t border-border bg-app-bg">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.Icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 py-[11px] text-center text-[9px] font-bold tracking-[0.3px] uppercase",
              active ? "text-primary" : "text-text-faint"
            )}
          >
            <Icon className="mx-auto mb-[3px] h-5 w-5" aria-hidden="true" />
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
