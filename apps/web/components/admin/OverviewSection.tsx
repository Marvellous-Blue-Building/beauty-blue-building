"use client";

import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AreaLineChart, BubbleChart, Sparkline } from "./charts";
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconDownload,
} from "./icons";
import type { AdminSection as Section } from "./AdminSidebar";

interface DailyRow {
  day: string;
  chats: number;
  scans: number;
  users: number;
}
interface RecentProduct {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  price: string;
  stock_quantity: number | null;
  image_url: string | null;
  updated_at: string | null;
}
export interface OverviewData {
  totalProducts: number;
  inStockProducts: number;
  stock: { inStock: number; lowStock: number; outOfStock: number };
  activeBoosts: number;
  widgetSessions: number;
  widgetConversations: number;
  widgetMessages: number;
  totals: { chat_messages: number; scans: number; users: number };
  daily: DailyRow[];
  categories: { category: string; n: number }[];
  recentProducts: RecentProduct[];
}

const C = {
  pink: "#d26287",
  rose: "#d9907d",
  taupe: "#b3a290",
  up: "#22a06b",
  down: "#e5484d",
};

/** Locale-aware formatters (en → en-US, id → id-ID). Prices stay in Rupiah. */
function useFormat() {
  const tag = useLocale() === "id" ? "id-ID" : "en-US";
  return {
    tag,
    nf: (n: number) => n.toLocaleString(tag),
    rupiah: (v: string | number) => `Rp ${Math.round(Number(v)).toLocaleString(tag)}`,
    // Series days are Asia/Jakarta calendar dates — format at UTC noon so no timezone shifts the day.
    dayLabel: (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}

/** Kebab menu with real navigation actions (no decorative no-op menus). */
function CardMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const t = useTranslations("admin.overview");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("menu.cardMenu")}
        aria-expanded={open}
        className="-mr-2 rounded-lg p-1.5 text-admin-ink transition hover:bg-white/50"
      >
        <IconDots size={20} />
      </button>
      {open && (
        <div className="glass-panel absolute right-0 top-9 z-20 min-w-44 rounded-2xl p-1.5">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-admin-ink transition hover:bg-white/60"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("glass-card relative rounded-[24px] p-6 lg:p-7", className)}>{children}</div>;
}

/** Last-7-days vs the 7 days before — the honest equivalent of "vs last month" for days-old data. */
function weekDelta(values: number[], newLabel: string) {
  const cur = values.slice(-7).reduce((a, b) => a + b, 0);
  const prev = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (prev === 0) return cur === 0 ? { kind: "flat" as const, text: "0%" } : { kind: "up" as const, text: newLabel };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { kind: pct > 0 ? ("up" as const) : pct < 0 ? ("down" as const) : ("flat" as const), text: `${pct > 0 ? "+ " : pct < 0 ? "- " : ""}${Math.abs(pct)}%` };
}

function KpiCard({
  title,
  value,
  series,
  tint,
  menu,
}: {
  title: string;
  value: number;
  series: number[];
  tint: string;
  menu: { label: string; onClick: () => void }[];
}) {
  const t = useTranslations("admin.overview");
  const { nf } = useFormat();
  const delta = weekDelta(series, t("kpi.new"));
  const color = delta.kind === "down" ? C.down : C.up;
  return (
    <Card className="overflow-hidden">
      <div aria-hidden className={clsx("pointer-events-none absolute inset-0 rounded-[24px] bg-gradient-to-br opacity-70", tint)} />
      <div className="relative">
        <div className="flex items-start justify-between">
          <h3 className="text-[17px] text-admin-ink">{title}</h3>
          <CardMenu items={menu} />
        </div>
        <div className="mt-6 flex items-end justify-between gap-3">
          <div className="min-w-0 shrink-0">
            <div className="truncate text-[44px] font-semibold leading-none tracking-tight text-admin-ink">{nf(value)}</div>
            <div className="mt-5 flex items-center gap-1.5 whitespace-nowrap text-[15px]">
              <span className="flex items-center gap-1 font-medium" style={{ color: delta.kind === "flat" ? undefined : color }}>
                {delta.kind === "up" && <IconArrowUp size={18} />}
                {delta.kind === "down" && <IconArrowDown size={18} />}
                {delta.text}
              </span>
              <span className="text-admin-ink-muted">{t("kpi.vsLastWeek")}</span>
            </div>
          </div>
          <div className="hidden min-w-0 justify-end overflow-hidden sm:flex md:hidden xl:flex">
            <Sparkline values={series.slice(-14)} color={color} />
          </div>
        </div>
      </div>
    </Card>
  );
}

const RANGES = [30, 14, 7] as const;

function ActivityCard({ daily }: { daily: DailyRow[] }) {
  const t = useTranslations("admin.overview.activity");
  const { dayLabel } = useFormat();
  const [days, setDays] = useState<number>(30);
  const rows = daily.slice(-days);

  function exportCsv() {
    const csv = ["tanggal,pesan_chat,skin_scan,pengguna_baru", ...rows.map((r) => `${r.day},${r.chats},${r.scans},${r.users}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `activity-${days}-days.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="xl:col-span-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h3 className="text-[17px] font-medium text-admin-ink">{t("title")}</h3>
        <div className="flex flex-1 gap-1 whitespace-nowrap">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition",
                days === d ? "glass-inset text-admin-ink shadow-sm" : "text-admin-ink-muted hover:text-admin-ink",
              )}
            >
              {t("range", { days: d })}
            </button>
          ))}
        </div>
        <button onClick={exportCsv} className="ml-auto flex items-center gap-2 rounded-lg border border-admin-ink/60 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-admin-ink transition hover:bg-white/50">
          <IconDownload size={16} />
          {t("exportCsv")}
        </button>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-admin-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: C.pink }} /> {t("chatSeries")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: C.rose }} /> {t("scanSeries")}
        </span>
      </div>
      <div className="mt-6">
        <AreaLineChart
          labels={rows.map((r) => dayLabel(r.day))}
          tooltipLabels={rows.map((r) => dayLabel(r.day))}
          series={[
            { label: t("chatSeries"), color: C.pink, values: rows.map((r) => r.chats) },
            { label: t("scanSeries"), color: C.rose, values: rows.map((r) => r.scans) },
          ]}
        />
      </div>
    </Card>
  );
}

function CategoriesCard({ categories, onSelect }: { categories: { category: string; n: number }[]; onSelect: (s: Section) => void }) {
  const t = useTranslations("admin.overview.categories");
  const { nf } = useFormat();
  const max = Math.max(...categories.map((c) => c.n), 1);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-medium text-admin-ink">{t("title")}</h3>
        <button onClick={() => onSelect("catalog")} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-admin-ink transition hover:text-admin-accent-strong">
          {t("top5")}
          <IconChevronRight size={14} />
        </button>
      </div>
      <div className="mt-8 flex flex-col gap-6">
        {categories.map((c) => (
          <div key={c.category}>
            <div className="flex items-center justify-between text-sm text-admin-ink">
              <span className="capitalize">{c.category.replace(/-/g, " ")}</span>
              <span>{nf(c.n)}</span>
            </div>
            <div className="mt-2.5 h-1.5 rounded-full bg-white/60">
              <div className="h-full rounded-full bg-admin-accent" style={{ width: `${(c.n / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {categories.length === 0 && <p className="text-sm text-admin-ink-muted">{t("empty")}</p>}
      </div>
    </Card>
  );
}

function StockCard({ stock, onSelect }: { stock: OverviewData["stock"]; onSelect: (s: Section) => void }) {
  const t = useTranslations("admin.overview.stock");
  const tm = useTranslations("admin.overview.menu");
  const { nf } = useFormat();
  const items = [
    { label: t("inStock"), value: stock.inStock, color: C.pink },
    { label: t("lowStock"), value: stock.lowStock, color: C.rose },
    { label: t("outOfStock"), value: stock.outOfStock, color: C.taupe },
  ];
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between">
        <h3 className="text-[22px] font-medium text-admin-ink">{t("title")}</h3>
        <CardMenu items={[{ label: tm("manageStock"), onClick: () => onSelect("catalog") }]} />
      </div>
      <div className="my-6 flex flex-1 items-center">
        <BubbleChart items={items} />
      </div>
      <div className="flex flex-col gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex items-center justify-between text-[15px]">
            <span className="flex items-center gap-2.5 text-admin-ink-muted">
              <span className="h-3 w-3 rounded-full" style={{ background: it.color }} />
              {it.label}
            </span>
            <span className="font-medium text-admin-ink">{nf(it.value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function stockStatus(q: number | null) {
  if (q == null || q <= 0) return { key: "out" as const, cls: "bg-admin-danger/10 text-admin-danger border-admin-danger/20" };
  if (q <= 5) return { key: "low" as const, cls: "bg-admin-rose/40 text-[#b4604d] border-admin-rose/60" };
  return { key: "available" as const, cls: "bg-admin-success/10 text-admin-success border-admin-success/20" };
}

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

const PAGE_SIZE = 5;

function RecentProductsCard({ products, onSelect }: { products: RecentProduct[]; onSelect: (s: Section) => void }) {
  const t = useTranslations("admin.overview.recent");
  const { tag, rupiah } = useFormat();
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const rows = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const th = "px-3.5 py-4 text-left text-[15px] font-medium text-admin-ink whitespace-nowrap";
  const td = "px-3.5 py-3 text-[15px] text-admin-ink whitespace-nowrap";

  return (
    <Card className="flex flex-col xl:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[22px] font-medium text-admin-ink">{t("title")}</h3>
        <button onClick={() => onSelect("catalog")} className="flex items-center gap-1.5 text-[15px] font-medium text-admin-accent-strong transition hover:opacity-80">
          {t("viewAll")}
          <IconArrowRight size={18} />
        </button>
      </div>
      <div className="no-scrollbar mt-6 flex-1 overflow-x-auto">
        <table className="w-full min-w-[600px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={clsx(th, "glass-inset rounded-l-xl border-r-0")}>{t("product")}</th>
              <th className={clsx(th, "glass-inset border-x-0")}>{t("name")}</th>
              <th className={clsx(th, "glass-inset border-x-0")}>{t("updated")}</th>
              <th className={clsx(th, "glass-inset border-x-0")}>{t("price")}</th>
              <th className={clsx(th, "glass-inset rounded-r-xl border-l-0")}>{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden>
              <td className="h-3" colSpan={5} />
            </tr>
            {rows.map((p) => {
              const s = stockStatus(p.stock_quantity);
              return (
                <tr key={p.id} className="transition hover:bg-white/30">
                  <td className={td}>
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote retailer CDN, not in next/image remotePatterns
                      <img src={p.image_url} alt="" loading="lazy" className="h-12 w-12 rounded-lg bg-white/60 object-cover ring-1 ring-white/80" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-admin-blush ring-1 ring-white/80" />
                    )}
                  </td>
                  <td className={clsx(td, "w-full max-w-[260px]")}>
                    <div className="truncate" title={p.name}>
                      {p.name}
                    </div>
                    <div className="truncate text-xs text-admin-ink-muted">
                      {[p.brand, p.sku].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className={td}>
                    {p.updated_at ? (
                      <span className="flex items-center gap-1.5">
                        <IconCalendar size={15} className="text-admin-ink-muted" />
                        {new Date(p.updated_at).toLocaleDateString(tag, { day: "numeric", month: "short", year: "2-digit" })}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={td}>{rupiah(p.price)}</td>
                  <td className={td}>
                    <span className={clsx("rounded-md border px-2 py-1 text-[13px]", s.cls)}>{t(`stockStatus.${s.key}`)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-admin-ink-muted">
        <span>
          {t("showing")} <span className="glass-inset mx-1 rounded-md px-2 py-0.5 text-admin-ink">{rows.length}</span> {t("of", { total: products.length })}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label={t("prevPage")} className="rounded-lg p-1.5 text-admin-accent-strong disabled:opacity-30">
            <IconChevronLeft size={18} />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1.5">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={clsx("h-8 min-w-8 rounded-lg px-2 text-sm transition", p === page ? "bg-admin-accent font-medium text-white" : "text-admin-ink hover:bg-white/50")}
              >
                {p}
              </button>
            ),
          )}
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} aria-label={t("nextPage")} className="rounded-lg p-1.5 text-admin-accent-strong disabled:opacity-30">
            <IconChevronRight size={18} />
          </button>
        </div>
      </div>
    </Card>
  );
}

export function OverviewSection({ onSelect }: { onSelect: (s: Section) => void }) {
  const t = useTranslations("admin.overview");
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="glass-card rounded-[24px] p-6 text-sm text-admin-danger">{t("loadError")}</p>;
  if (!data)
    return (
      <div className="grid animate-pulse grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-card h-[220px] rounded-[24px]" />
        ))}
      </div>
    );

  const chats = data.daily.map((d) => d.chats);
  const scans = data.daily.map((d) => d.scans);
  const users = data.daily.map((d) => d.users);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <KpiCard
          title={t("kpi.chats")}
          value={data.totals.chat_messages}
          series={chats}
          tint="from-admin-pink/15 to-transparent"
          menu={[
            { label: t("menu.openSimulator"), onClick: () => onSelect("simulator") },
            { label: t("menu.viewDemandSignal"), onClick: () => onSelect("forecasting") },
          ]}
        />
        <KpiCard
          title={t("kpi.scans")}
          value={data.totals.scans}
          series={scans}
          tint="from-admin-blush/80 to-transparent"
          menu={[{ label: t("menu.viewForecasting"), onClick: () => onSelect("forecasting") }]}
        />
        <KpiCard
          title={t("kpi.users")}
          value={data.totals.users}
          series={users}
          tint="from-admin-cream/90 to-admin-taupe/30"
          menu={[{ label: t("menu.viewIntegration"), onClick: () => onSelect("integration") }]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ActivityCard daily={data.daily} />
        <CategoriesCard categories={data.categories} onSelect={onSelect} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <StockCard stock={data.stock} onSelect={onSelect} />
        <RecentProductsCard products={data.recentProducts} onSelect={onSelect} />
      </div>
    </div>
  );
}
