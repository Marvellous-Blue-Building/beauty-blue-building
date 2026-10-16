"use client";

import { Link, useRouter } from "@/i18n/navigation";

export type AdminSection =
  | "overview"
  | "catalog"
  | "marketing"
  | "forecasting"
  | "simulator"
  | "integration";

/** A selectable sidebar entry — dashboard sections plus the standalone
 * "Conversation history" page (which is a real route, not an in-page tab). */
export type AdminNavKey = AdminSection | "conversations";

const NAV: { id: AdminSection; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Ringkasan aktivitas" },
  { id: "catalog", label: "Katalog", hint: "Produk, harga, stok" },
  { id: "marketing", label: "Marketing & Trend", hint: "Boost keyword" },
  { id: "forecasting", label: "Forecasting", hint: "Demand signal" },
  { id: "simulator", label: "Chat Simulator", hint: "Uji widget" },
  { id: "integration", label: "Integrasi", hint: "Embed widget" },
];

export function AdminSidebar({
  active,
  onSelect,
}: {
  active: AdminNavKey;
  /** Dashboard sections switch in-page. Omit on standalone pages — section
   * clicks then navigate back to the dashboard. */
  onSelect?: (s: AdminSection) => void;
}) {
  const router = useRouter();

  const itemCls = (isActive: boolean) =>
    `rounded-lg px-3 py-2.5 text-left text-sm transition ${
      isActive ? "bg-primary-dim font-semibold text-primary" : "text-neutral-600 hover:bg-neutral-50"
    }`;

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <div className="text-sm font-bold text-neutral-900">Beauty Advisor</div>
        <div className="text-xs text-neutral-400">Tenant Dashboard</div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => (onSelect ? onSelect(item.id) : router.push("/admin"))}
            className={itemCls(active === item.id)}
          >
            <div>{item.label}</div>
            <div className="text-[11px] font-normal text-neutral-400">{item.hint}</div>
          </button>
        ))}
        <Link href="/admin/conversations" className={itemCls(active === "conversations")}>
          <div>Conversation history</div>
          <div className="text-[11px] font-normal text-neutral-400">Riwayat percakapan</div>
        </Link>
      </nav>
      <div className="mt-auto p-3">
        <button
          onClick={() => fetch("/api/admin/login", { method: "DELETE" }).then(() => location.reload())}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-50"
        >
          Keluar
        </button>
      </div>
    </div>
  );
}
