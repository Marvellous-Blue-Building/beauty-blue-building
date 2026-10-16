"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

export type AdminSection =
  | "overview"
  | "catalog"
  | "marketing"
  | "forecasting"
  | "simulator"
  | "integration"
  | "conversations";

const NAV: AdminSection[] = ["overview", "catalog", "marketing", "forecasting", "simulator", "integration", "conversations"];

export function AdminSidebar({
  active,
  onSelect,
}: {
  active: AdminSection;
  onSelect?: (s: AdminSection) => void;
}) {
  const router = useRouter();
  const t = useTranslations("admin.sidebar");

  const itemCls = (isActive: boolean) =>
    `rounded-lg px-3 py-2.5 text-left text-sm transition ${
      isActive ? "bg-primary-dim font-semibold text-primary" : "text-neutral-600 hover:bg-neutral-50"
    }`;

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <div className="text-sm font-bold text-neutral-900">{t("appName")}</div>
        <div className="text-xs text-neutral-400">{t("tenantDashboard")}</div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map((id) => (
          <button
            key={id}
            onClick={() => (onSelect ? onSelect(id) : router.push("/admin"))}
            className={itemCls(active === id)}
          >
            <div>{t(`nav.${id}.label`)}</div>
            <div className="text-[11px] font-normal text-neutral-400">{t(`nav.${id}.hint`)}</div>
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 p-3">
        <LocaleSwitcher />
        <button
          onClick={() => fetch("/api/admin/login", { method: "DELETE" }).then(() => location.reload())}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
