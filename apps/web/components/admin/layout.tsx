"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import type { AdminSection as Section } from "./AdminSidebar";
import { IconBell, IconChat, IconClose, IconMenu, IconPlus, IconSearch } from "./icons";

function CircleButton({ label, onClick, children, dot }: { label: string; onClick: () => void; children: ReactNode; dot?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="glass-inset relative flex h-11 w-11 items-center justify-center rounded-full text-admin-ink-muted transition hover:text-admin-ink"
    >
      {children}
      {dot && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-admin-danger ring-2 ring-white" />}
    </button>
  );
}

export function AdminHeader({
  onMenu,
  onSearchFocus,
  onSelect,
  alertCount,
}: {
  onMenu: () => void;
  onSearchFocus: () => void;
  onSelect: (s: Section) => void;
  alertCount: number;
}) {
  const t = useTranslations("admin.header");
  return (
    <header className="flex flex-wrap items-center gap-4">
      <button onClick={onMenu} aria-label={t("openMenu")} className="glass-inset flex h-11 w-11 items-center justify-center rounded-xl text-admin-ink lg:hidden">
        <IconMenu />
      </button>
      <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
        <h1 className="text-2xl font-medium tracking-tight text-admin-ink">{t("greeting")}</h1>
        <p className="mt-1 text-[15px] text-admin-ink-muted">{t("welcome")}</p>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <CircleButton label={t("searchProducts")} onClick={onSearchFocus}>
          <IconSearch size={20} />
        </CircleButton>
        <CircleButton
          label={alertCount > 0 ? t("alerts", { count: alertCount }) : t("noAlerts")}
          onClick={() => onSelect("forecasting")}
          dot={alertCount > 0}
        >
          <IconBell size={20} />
        </CircleButton>
        <button
          onClick={() => onSelect("simulator")}
          className="glass-inset ml-1 hidden h-12 items-center gap-2 rounded-xl px-4 text-[15px] text-admin-ink-muted transition hover:text-admin-ink sm:flex"
        >
          <IconChat size={20} />
          {t("simulator")}
        </button>
        <button
          onClick={() => onSelect("marketing")}
          className="flex h-12 items-center gap-2 rounded-xl bg-admin-accent px-5 text-[15px] font-medium text-white shadow-[0_10px_24px_-10px_rgb(210_98_135/0.9)] transition hover:bg-admin-accent-strong"
        >
          <IconPlus size={20} />
          <span className="hidden sm:inline">{t("addBoost")}</span>
        </button>
      </div>
    </header>
  );
}

/**
 * Full-viewport glass shell: photo backdrop + decorative orbs, a max-width
 * frosted frame holding the sidebar (drawer below lg) and a scrolling main.
 */
export function AdminFrame({
  sidebar,
  header,
  children,
  drawerOpen,
  onCloseDrawer,
}: {
  sidebar: ReactNode;
  /** Stays put above the scrolling content. */
  header: ReactNode;
  children: ReactNode;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const t = useTranslations("admin.header");
  return (
    <div className="relative h-full w-full overflow-hidden bg-admin-cream bg-cover bg-center" style={{ backgroundImage: "url(/admin/dashboard-bg.jpg)" }}>
      {/* Decorative 3D-ish orbs sitting behind the frame so its glass blurs them. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full lg:h-96 lg:w-96"
        style={{ background: "radial-gradient(circle at 32% 28%, #fff6f2 0%, #f2ded7 22%, #efc5b9 52%, #d9907d 100%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-[22%] h-52 w-52 rounded-full opacity-90"
        style={{ background: "radial-gradient(circle at 35% 30%, #ffffff 0%, #f2ded7 35%, #e3a0b6 100%)" }}
      />

      <div className="relative mx-auto flex h-full max-w-[1480px] p-3 sm:p-5 lg:p-8">
        <div className="glass-frame flex h-full w-full overflow-hidden rounded-[28px] lg:rounded-[40px]">
          <aside className="hidden w-[300px] shrink-0 lg:block">{sidebar}</aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="shrink-0 px-5 pb-5 pt-6 sm:px-8 lg:pl-2 lg:pr-8 lg:pt-7">{header}</div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-3 [mask-image:linear-gradient(to_bottom,transparent,black_20px)] sm:px-8 lg:pl-2 lg:pr-8">{children}</div>
          </main>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label={t("closeMenu")} onClick={onCloseDrawer} className="absolute inset-0 bg-admin-ink/20 backdrop-blur-sm" />
          <div className="glass-frame absolute inset-y-3 left-3 w-[300px] max-w-[calc(100%-24px)] rounded-[28px]">
            <button onClick={onCloseDrawer} aria-label={t("closeMenu")} className="absolute right-4 top-6 z-10 rounded-lg p-1.5 text-admin-ink-muted hover:text-admin-ink">
              <IconClose size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}

/** ⌘K / Ctrl+K focuses the sidebar product search. */
export function useSearchShortcut(focus: () => void) {
  const cb = useRef(focus);
  useEffect(() => {
    cb.current = focus;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        cb.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
