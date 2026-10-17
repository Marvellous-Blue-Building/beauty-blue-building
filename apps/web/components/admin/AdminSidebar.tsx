"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { IconBox, IconChart, IconChat, IconCode, IconGrid, IconHistory, IconLogout, IconSearch, IconSparkle, IconTrend } from "./icons";

export type AdminSection =
  | "overview"
  | "catalog"
  | "marketing"
  | "forecasting"
  | "simulator"
  | "integration"
  | "conversations";

const MAIN_NAV: { id: AdminSection; icon: ReactNode }[] = [
  { id: "overview", icon: <IconGrid /> },
  { id: "catalog", icon: <IconBox /> },
  { id: "marketing", icon: <IconTrend /> },
  { id: "forecasting", icon: <IconChart /> },
];
const APPS_NAV: { id: AdminSection; icon: ReactNode }[] = [
  { id: "simulator", icon: <IconChat /> },
  { id: "integration", icon: <IconCode /> },
  { id: "conversations", icon: <IconHistory /> },
];

function NavItem({ active, icon, label, hint, onClick }: { active: boolean; icon: ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex h-12 w-full shrink-0 items-center gap-3 rounded-2xl px-4 text-left text-[15px] transition",
        active
          ? "bg-admin-accent font-medium text-white shadow-[0_10px_24px_-10px_rgb(210_98_135/0.9)]"
          : "text-admin-nav-ink hover:bg-white/45 hover:text-admin-ink",
      )}
    >
      <span className={active ? "text-white" : "text-admin-nav-ink"}>{icon}</span>
      {label}
    </button>
  );
}

/**
 * Glass sidebar (docs/admin-ui-guidelines.md). Without `onSelect` (pages
 * outside the single-page dashboard) a nav click returns to /admin.
 */
export function AdminSidebar({
  active,
  onSelect,
  onSearch,
  searchRef,
}: {
  active: AdminSection;
  onSelect?: (s: AdminSection) => void;
  onSearch?: (q: string) => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const t = useTranslations("admin.sidebar");
  const [q, setQ] = useState("");
  const go = (id: AdminSection) => (onSelect ? onSelect(id) : router.push("/admin"));

  return (
    <div className="flex h-full w-full flex-col px-5 pb-6 pt-7">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-admin-accent text-white shadow-[0_8px_20px_-6px_rgb(210_98_135/0.7)]">
          <IconSparkle size={20} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[17px] font-bold tracking-tight text-admin-ink">{t("appName")}</div>
          <div className="text-[11px] text-admin-ink-muted">{t("tenantDashboard")}</div>
        </div>
      </div>

      {onSearch && (
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(q.trim());
          }}
        >
          <label className="glass-field glass-inset flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl pl-3.5 pr-2 focus-within:ring-4 focus-within:ring-admin-accent/15">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-sm text-admin-ink placeholder:text-admin-ink-muted focus:outline-none"
            />
            <kbd className="rounded-md border border-white/80 bg-white/60 px-1.5 py-0.5 font-sans text-[11px] text-admin-ink-muted">⌘K</kbd>
          </label>
          <button type="submit" aria-label={t("searchButton")} className="glass-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-admin-ink-muted transition hover:text-admin-ink">
            <IconSearch size={18} />
          </button>
        </form>
      )}

      <nav className="no-scrollbar mt-6 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {MAIN_NAV.map((item) => (
          <NavItem key={item.id} active={active === item.id} icon={item.icon} label={t(`nav.${item.id}.label`)} hint={t(`nav.${item.id}.hint`)} onClick={() => go(item.id)} />
        ))}
        <div className="mb-1 mt-6 px-4 text-xs font-medium uppercase tracking-[0.12em] text-admin-nav-ink">{t("apps")}</div>
        {APPS_NAV.map((item) => (
          <NavItem key={item.id} active={active === item.id} icon={item.icon} label={t(`nav.${item.id}.label`)} hint={t(`nav.${item.id}.hint`)} onClick={() => go(item.id)} />
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-1.5">
        <button
          onClick={async () => {
            await fetch("/api/admin/login", { method: "DELETE" });
            router.replace("/login");
            router.refresh();
          }}
          className="flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] text-admin-nav-ink transition hover:bg-white/45 hover:text-admin-danger"
        >
          <span>
            <IconLogout />
          </span>
          {t("logout")}
        </button>
        <div className="mt-3 flex items-center gap-3 rounded-2xl px-3 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-admin-rose to-admin-blush text-sm font-semibold text-admin-pink-strong ring-2 ring-white/80">
            AD
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-admin-ink">{t("adminName")}</div>
            <div className="truncate text-xs text-admin-ink-muted">{t("adminRole")}</div>
          </div>
          <LocaleSwitcher />
        </div>
      </div>
    </div>
  );
}
