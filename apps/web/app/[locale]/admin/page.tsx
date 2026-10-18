"use client";

import { useEffect, useRef, useState } from "react";
import { AdminSidebar, type AdminSection } from "@/components/admin/AdminSidebar";
import { AdminFrame, AdminHeader, useSearchShortcut } from "@/components/admin/layout";
import {
  btnPrimaryCls,
  btnSecondaryCls,
  btnSecondarySmCls,
  glassFieldCls,
  glassFieldSmCls,
  linkAccentCls,
  pillCls,
  subtlePanelCls,
  tdGlassCls,
  thGlassCls,
} from "@/components/admin/glass";
import { OverviewSection } from "@/components/admin/OverviewSection";
import { InsightSection } from "@/components/admin/InsightSection";
import { IconSparkle } from "@/components/admin/icons";
import { ProductCardRow, type ProductCardData } from "@/components/admin/ProductCardRow";
import { useLocale, useTranslations } from "next-intl";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatDate as formatDateNumeric } from "@/lib/format";

/**
 * Tenant dashboard — sidebar shell + 7 sections (the last being the
 * Conversation history section). Deliberately escapes the
 * shopper app's global `max-w-[480px]` mobile shell (app/[locale]/layout.tsx)
 * via `fixed inset-0`: this is an internal merchandising tool, not part of
 * the mobile-first shopper flow, and should use the full viewport.
 *
 * Forecasting section is explicitly scoped and labeled: the user supplied a
 * knowledge-base document describing a full 3-phase, 8-month enterprise
 * forecasting system (data warehouse, Holt-Winters/Prophet/LightGBM, MMM,
 * sentiment, event-uplift modeling — see apps/web/Knowledge Base Sistem
 * Analitik Forecasting & Marketing Beauty.md). None of that system's
 * prerequisites exist in this project (no orders/transactions table, no
 * marketplace/ads integrations, no 12+ months of sales history), so this
 * dashboard shows only the real Phase 1 "demand signal" heuristic (cart
 * adds + chat mentions, already-accumulating real data) and marks Phase
 * 2/3 as an honest roadmap, not a fake/mocked implementation of them.
 */

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  price: string;
  stock_quantity: number;
  category: string | null;
  sku: string | null;
}
interface BoostRow {
  id: string;
  keyword: string;
  category: string | null;
  weight: number;
  active: boolean;
  createdAt: string;
}
interface AnalyticsRow {
  id: string;
  name: string;
  brand: string | null;
  price: string;
  stock_quantity: number;
  category: string | null;
  cart_adds: number;
  chat_mentions: number;
  signal_score: number;
  forecastNextHour: number;
  trend: "up" | "down" | "flat";
  trendValue: number;
  dataPoints: number;
  alarmLevel: -1 | 0 | 1 | 2 | 3;
  alarmLabel: string;
  cusum: number;
  hoursOfStockLeft: number | null;
  series: { bucket: string; actual: number; baseline: number }[];
  signalBreakdown: { signal: string; value: number; z: number; weight: number }[];
  override: { id: string; productId: string; overrideValue: number; reason: string; createdAt: string } | null;
  lastAlertAction: { action: "tindak_lanjut" | "diabaikan" | "salah_alarm"; createdAt: string } | null;
}
interface SentimentRow {
  id: string;
  name: string;
  brand: string | null;
  positive: number;
  negative: number;
  neutral: number;
}
interface EventAnalyticsRow {
  id: string;
  name: string;
  type: string;
  subType: string | null;
  startsAt: string;
  endsAt: string;
  categoryFocus: string | null;
  discountPct: number | null;
  adBudget: number | null;
  promoCode: string | null;
  status: "rencana" | "disetujui" | "berjalan" | "selesai" | "batal";
  milestonesDone: string[];
  historicalUplift: {
    upliftBersih: number | null;
    significant: boolean;
  } | null;
  upcomingUplift: { upliftEstimasi: number | null; basis: "lookup" | "estimasi_kasar" } | null;
  attribution: { sessions: number; mentions: number; costPerSession: number | null } | null;
}
interface SimMessage {
  role: "user" | "bot";
  text: string;
  products?: { name: string; brand?: string; price?: number; imageUrl?: string | null; colorPalette?: string[]; sizeLabel?: string | null }[];
}

const inputCls = glassFieldCls;
const thCls = thGlassCls;
const tdCls = tdGlassCls;

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="glass-card flex h-full flex-col rounded-[24px] p-6">
      <h2 className="text-base font-bold text-neutral-700">{title}</h2>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{subtitle}</p>}
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

function CatalogSection({ initialSearch = "" }: { initialSearch?: string }) {
  const t = useTranslations("admin.catalog");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState(initialSearch);

  async function loadProducts(q?: string) {
    const res = await fetch(`/api/admin/products${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setProducts(data.products ?? []);
  }
  useEffect(() => {
    loadProducts(initialSearch || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remounted (keyed) on each new sidebar search
  }, []);

  async function updateProduct(id: string, patch: Partial<{ price: number; stockQuantity: number; category: string }>) {
    await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-neutral-700">{t("title")}</h1>
      <Card title={t("cardTitle")}>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadProducts(search)}
            placeholder={t("searchPlaceholder")}
            className={`${inputCls} min-w-[200px] flex-1`}
          />
          <button onClick={() => loadProducts(search)} className={btnSecondaryCls}>
            {t("searchButton")}
          </button>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={thCls}>{t("columns.product")}</th>
                <th className={thCls}>{t("columns.price")}</th>
                <th className={thCls}>{t("columns.stock")}</th>
                <th className={thCls}>{t("columns.category")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className={tdCls}>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-[11px] text-neutral-400">{p.brand}</div>
                  </td>
                  <td className={tdCls}>
                    <input
                      type="number"
                      defaultValue={Math.round(Number(p.price))}
                      onBlur={(e) => updateProduct(p.id, { price: Number(e.target.value) })}
                      className={`${glassFieldSmCls} w-24`}
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      type="number"
                      defaultValue={p.stock_quantity}
                      onBlur={(e) => updateProduct(p.id, { stockQuantity: Number(e.target.value) })}
                      className={`${glassFieldSmCls} w-16`}
                    />
                  </td>
                  <td className={tdCls}>{p.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MarketingSection() {
  const t = useTranslations("admin.marketing");
  const [boosts, setBoosts] = useState<BoostRow[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newWeight, setNewWeight] = useState(3);

  async function loadBoosts() {
    const res = await fetch("/api/admin/tenant-boosts");
    const data = await res.json();
    setBoosts(data.boosts ?? []);
  }
  useEffect(() => {
    loadBoosts();
  }, []);

  async function addBoost() {
    if (!newKeyword.trim()) return;
    await fetch("/api/admin/tenant-boosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: newKeyword.trim(), weight: newWeight }),
    });
    setNewKeyword("");
    loadBoosts();
  }
  async function toggleBoost(id: string, active: boolean) {
    await fetch(`/api/admin/tenant-boosts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    loadBoosts();
  }
  async function deleteBoost(id: string) {
    await fetch(`/api/admin/tenant-boosts/${id}`, { method: "DELETE" });
    loadBoosts();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-neutral-700">{t("title")}</h1>
      <Card title={t("cardTitle")} subtitle={t("cardSubtitle")}>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBoost()}
            placeholder={t("keywordPlaceholder")}
            className={`${inputCls} min-w-[160px] flex-1`}
          />
          <select value={newWeight} onChange={(e) => setNewWeight(Number(e.target.value))} className={inputCls}>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                {t("weightOption", { w })}
              </option>
            ))}
          </select>
          <button onClick={addBoost} className={btnPrimaryCls}>
            {t("addButton")}
          </button>
        </div>
        <table className="w-full min-w-[420px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={thCls}>{t("columns.keyword")}</th>
              <th className={thCls}>{t("columns.weight")}</th>
              <th className={thCls}>{t("columns.status")}</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {boosts.map((b) => (
              <tr key={b.id}>
                <td className={tdCls}>{b.keyword}</td>
                <td className={tdCls}>{b.weight}</td>
                <td className={tdCls}>
                  <button
                    onClick={() => toggleBoost(b.id, !b.active)}
                    className={`${pillCls(b.active ? "success" : "neutral")} px-2.5 py-1`}
                  >
                    {b.active ? t("active") : t("inactive")}
                  </button>
                </td>
                <td className={tdCls}>
                  <button onClick={() => deleteBoost(b.id)} className="text-[11px] font-medium text-admin-danger hover:underline">
                    {t("delete")}
                  </button>
                </td>
              </tr>
            ))}
            {boosts.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={4}>
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const EVENT_TYPE_VALUES = ["event_offline", "promo_marketplace", "promo_brand", "campaign", "seasonal"] as const;
const EVENT_STATUSES: EventAnalyticsRow["status"][] = ["rencana", "disetujui", "berjalan", "selesai", "batal"];

/** Fixed numeric dd/MM/yyyy — matches the rest of the app's convention
 * (lib/format.ts) of never baking a locale into the date shape itself,
 * only into surrounding UI copy. */
function fmtDate(iso: string): string {
  return formatDateNumeric(iso);
}
function fmtPct(v: number | null): string {
  if (v === null) return "—";
  const pct = Math.round(v * 1000) / 10;
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

const ALARM_STYLE: Record<number, string> = {
  "-1": "bg-admin-taupe/50 text-admin-nav-ink",
  "0": "bg-white/60 text-admin-nav-ink",
  "1": "bg-admin-warning/15 text-[#9a6b06]",
  "2": "bg-admin-rose/45 text-[#a5513f]",
  "3": "bg-admin-danger/10 text-admin-danger",
};
const MILESTONE_KEYS = ["H-56", "H-42", "H-21", "H-7", "H-3", "H+5", "H+21"] as const;
const MILESTONE_DAYS: Record<(typeof MILESTONE_KEYS)[number], number> = {
  "H-56": -56,
  "H-42": -42,
  "H-21": -21,
  "H-7": -7,
  "H-3": -3,
  "H+5": 5,
  "H+21": 21,
};

/** Maps the API's own alarm label ("Normal"|"Watch"|"Rising"|"Surge"|"Fading",
 * see lib/analytics/cusum.ts's ALARM_LABELS) into the translated version. */
function alarmLabelKey(apiLabel: string): string {
  return apiLabel.toLowerCase();
}

function TrendBadge({ trend }: { trend: "up" | "down" | "flat" }) {
  const t = useTranslations("admin.forecasting.shared");
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        trend === "up" ? "bg-admin-success/10 text-admin-success" : trend === "down" ? "bg-admin-danger/10 text-admin-danger" : "bg-white/60 text-admin-nav-ink"
      }`}
    >
      {arrow} {t(`trend.${trend}`)}
    </span>
  );
}
function AlarmBadge({ level, label, cusum }: { level: number; label: string; cusum: number }) {
  const t = useTranslations("admin.forecasting.shared");
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ALARM_STYLE[level]}`}>
      {t(`alarmLabels.${alarmLabelKey(label)}`)} · C={cusum}
    </span>
  );
}
function KpiTile({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <div className="glass-card rounded-[20px] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${danger ? "text-admin-danger" : "text-neutral-700"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-neutral-400">{hint}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${subtlePanelCls} p-3`}>
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className="text-sm font-semibold text-neutral-700">{value}</div>
    </div>
  );
}
function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-admin-accent text-white shadow-[0_8px_20px_-8px_rgb(210_98_135/0.7)]" : "glass-inset text-neutral-700 hover:bg-white/75"}`}
    >
      {children}
    </button>
  );
}

function ForecastChart({ series }: { series: { bucket: string; actual: number; baseline: number }[] }) {
  const t = useTranslations("admin.forecasting.shared");
  if (series.length === 0) return <p className="text-sm text-neutral-400">{t("chart.emptySeries")}</p>;
  const actualLabel = t("chart.actual");
  const baselineLabel = t("chart.baseline");
  const data = series.map((p) => ({
    time: formatDateNumeric(p.bucket) + " " + new Date(p.bucket).toTimeString().slice(0, 5),
    [actualLabel]: p.actual,
    [baselineLabel]: p.baseline,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(64 64 64 / 0.08)" />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey={actualLabel} stroke="var(--color-admin-accent)" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey={baselineLabel} stroke="var(--color-admin-taupe-strong)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EventTimeline({ events, onSelect, selectedId }: { events: EventAnalyticsRow[]; onSelect: (e: EventAnalyticsRow) => void; selectedId?: string }) {
  const t = useTranslations("admin.forecasting.shared");
  const tTimeline = useTranslations("admin.forecasting.events.timeline");
  const [now] = useState(() => Date.now());
  if (events.length === 0) return <p className="text-sm text-neutral-400">{tTimeline("empty")}</p>;
  const starts = events.map((e) => new Date(e.startsAt).getTime());
  const ends = events.map((e) => new Date(e.endsAt).getTime());
  const rangeStart = Math.min(...starts) - 3 * 86400000;
  const rangeEnd = Math.max(...ends) + 3 * 86400000;
  const span = rangeEnd - rangeStart || 1;
  const nowPct = ((now - rangeStart) / span) * 100;

  const byType = new Map<string, EventAnalyticsRow[]>();
  for (const e of events) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);

  return (
    <div className="flex flex-col gap-4">
      {[...byType.entries()].map(([type, rows]) => (
        <div key={type}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {EVENT_TYPE_VALUES.includes(type as (typeof EVENT_TYPE_VALUES)[number]) ? t(`eventTypes.${type}`) : type}
          </div>
          <div className="relative h-9 rounded-lg bg-white/45">
            {nowPct >= 0 && nowPct <= 100 && (
              <div className="absolute top-0 h-full border-l-2 border-dashed border-admin-accent/60" style={{ left: `${nowPct}%` }} />
            )}
            {rows.map((e) => {
              const left = ((new Date(e.startsAt).getTime() - rangeStart) / span) * 100;
              const width = Math.max(9, ((new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) / span) * 100);
              const color =
                e.status === "batal"
                  ? "bg-admin-taupe/60 text-admin-nav-ink line-through"
                  : e.status === "selesai"
                    ? "bg-admin-taupe-strong"
                    : e.id === selectedId
                      ? "bg-admin-accent ring-2 ring-white ring-offset-1 ring-offset-admin-accent"
                      : "bg-admin-accent/75";
              return (
                <button
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className={`absolute top-1 h-7 overflow-hidden whitespace-nowrap rounded px-2 text-left text-[11px] text-white ${color}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={e.name}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-neutral-400">{tTimeline("legend")}</p>
    </div>
  );
}

function MilestoneChecklist({ event, onToggle }: { event: EventAnalyticsRow; onToggle: (key: string, done: boolean) => void }) {
  const t = useTranslations("admin.forecasting.shared");
  const [now] = useState(() => Date.now());
  const startMs = new Date(event.startsAt).getTime();
  return (
    <ul className="flex flex-col gap-1.5">
      {MILESTONE_KEYS.map((key) => {
        const dueAt = startMs + MILESTONE_DAYS[key] * 86400000;
        const done = event.milestonesDone.includes(key);
        const overdue = !done && dueAt < now;
        return (
          <li key={key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={done} onChange={(e) => onToggle(key, e.target.checked)} className="mt-1" />
            <span className={overdue ? "text-admin-danger" : "text-neutral-700"}>
              <span className="font-semibold">{key}</span> · {t(`milestones.${key}`)}
              {overdue ? t("overdueSuffix") : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const UPLIFT_TAB_IDS = ["overview", "sku", "events", "marketing"] as const;

function OverviewTab({
  analytics,
  events,
  sentiment,
  onSelectProduct,
  reloadAnalytics,
}: {
  analytics: AnalyticsRow[];
  events: EventAnalyticsRow[];
  sentiment: SentimentRow[];
  onSelectProduct: (id: string) => void;
  reloadAnalytics: () => void;
}) {
  const t = useTranslations("admin.forecasting.overview");
  const tShared = useTranslations("admin.forecasting.shared");
  const [sendingAlertId, setSendingAlertId] = useState<string | null>(null);
  const [alertSentIds, setAlertSentIds] = useState<Set<string>>(new Set());
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  async function sendAlertEmail(productId: string) {
    setSendingAlertId(productId);
    try {
      const res = await fetch("/api/admin/analytics/alert-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.ok) setAlertSentIds((prev) => new Set(prev).add(productId));
    } finally {
      setSendingAlertId(null);
    }
  }

  async function logAction(a: AnalyticsRow, action: "tindak_lanjut" | "diabaikan" | "salah_alarm") {
    setLoggingId(a.id);
    try {
      await fetch("/api/admin/analytics/alert-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: a.id, alarmLevel: a.alarmLevel, cusum: a.cusum, action }),
      });
      reloadAnalytics();
    } finally {
      setLoggingId(null);
    }
  }

  const activeAlerts = analytics.filter((a) => a.alarmLevel >= 1).length;
  const stockoutRisk = analytics.filter((a) => a.hoursOfStockLeft !== null && a.hoursOfStockLeft < 24).length;
  const totalForecastSignal = Math.round(analytics.reduce((s, a) => s + a.forecastNextHour, 0) * 10) / 10;
  const eventsNear = events.filter((e) => {
    const d = new Date(e.startsAt).getTime();
    return d >= now - 30 * 86400000 && d <= now + 30 * 86400000;
  }).length;
  const finishedUplifts = events.map((e) => e.historicalUplift?.upliftBersih).filter((v): v is number => v !== null && v !== undefined);
  const avgUplift = finishedUplifts.length > 0 ? finishedUplifts.reduce((a, b) => a + b, 0) / finishedUplifts.length : null;
  const topProduct = [...analytics].sort((a, b) => b.alarmLevel - a.alarmLevel || b.cusum - a.cusum)[0] ?? null;
  const upcoming = events
    .filter((e) => ["rencana", "disetujui"].includes(e.status) && new Date(e.startsAt).getTime() <= now + 56 * 86400000)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);
  const alerting = analytics.filter((a) => a.alarmLevel >= 2);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiTile label={t("kpi.alertActiveLabel")} value={String(activeAlerts)} hint={t("kpi.alertActiveHint")} />
        <KpiTile label={t("kpi.stockoutRiskLabel")} value={String(stockoutRisk)} hint={t("kpi.stockoutRiskHint")} danger={stockoutRisk > 0} />
        <KpiTile label={t("kpi.forecastSignalLabel")} value={String(totalForecastSignal)} hint={t("kpi.forecastSignalHint")} />
        <KpiTile label={t("kpi.eventsNearLabel")} value={String(eventsNear)} hint={t("kpi.eventsNearHint")} />
        <KpiTile label={t("kpi.avgUpliftLabel")} value={fmtPct(avgUplift)} hint={t("kpi.avgUpliftHint", { count: finishedUplifts.length })} />
      </div>

      <Card
        title={t("forecastChart.title")}
        subtitle={
          topProduct
            ? t("forecastChart.topProductSubtitle", { name: topProduct.name, label: topProduct.alarmLabel })
            : t("forecastChart.emptySubtitle")
        }
      >
        {topProduct ? (
          <>
            <ForecastChart series={topProduct.series} />
            <button onClick={() => onSelectProduct(topProduct.id)} className={`mt-2 text-[11px] ${linkAccentCls}`}>
              {t("forecastChart.viewDetail")}
            </button>
          </>
        ) : (
          <p className="text-sm text-neutral-400">{t("forecastChart.emptyBody")}</p>
        )}
      </Card>

      <Card title={t("skuTable.title")} subtitle={t("skuTable.subtitle")}>
        <table className="w-full min-w-[760px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={thCls}>{t("skuTable.columns.sku")}</th>
              <th className={thCls}>{t("skuTable.columns.category")}</th>
              <th className={thCls}>{t("skuTable.columns.forecastNextHour")}</th>
              <th className={thCls}>{t("skuTable.columns.trend")}</th>
              <th className={thCls}>{t("skuTable.columns.stock")}</th>
              <th className={thCls}>{t("skuTable.columns.cover")}</th>
              <th className={thCls}>{t("skuTable.columns.signal")}</th>
              <th className={thCls}>{t("skuTable.columns.action")}</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((a) => (
              <tr key={a.id}>
                <td className={tdCls}>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-[11px] text-neutral-400">{a.brand}</div>
                </td>
                <td className={tdCls}>{a.category ?? "—"}</td>
                <td className={`${tdCls} font-bold`}>{a.forecastNextHour}</td>
                <td className={tdCls}>
                  <TrendBadge trend={a.trend} />
                </td>
                <td className={tdCls}>{a.stock_quantity}</td>
                <td className={tdCls}>
                  {a.hoursOfStockLeft === null ? "—" : <span className={a.hoursOfStockLeft < 24 ? "font-semibold text-admin-danger" : ""}>{a.hoursOfStockLeft}</span>}
                </td>
                <td className={tdCls}>
                  <AlarmBadge level={a.alarmLevel} label={a.alarmLabel} cusum={a.cusum} />
                </td>
                <td className={tdCls}>
                  <div className="flex flex-col items-start gap-1">
                    <button onClick={() => onSelectProduct(a.id)} className={`text-[11px] ${linkAccentCls}`}>
                      {t("skuTable.viewDetail")}
                    </button>
                    {a.alarmLevel >= 2 && (
                      <button
                        onClick={() => sendAlertEmail(a.id)}
                        disabled={sendingAlertId === a.id}
                        className="text-[11px] text-neutral-500 hover:underline disabled:opacity-50"
                      >
                        {sendingAlertId === a.id ? t("skuTable.sending") : alertSentIds.has(a.id) ? t("skuTable.sent") : t("skuTable.sendAlert")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {analytics.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={8}>
                  {t("skuTable.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t("upcomingEvents.title")} subtitle={t("upcomingEvents.subtitle")}>
          <ul className="flex flex-col gap-2">
            {upcoming.map((e) => (
              <li key={e.id} className={`${subtlePanelCls} p-2.5 text-sm`}>
                <div className="font-semibold">{e.name}</div>
                <div className="text-[11px] text-neutral-400">
                  {fmtDate(e.startsAt)} · {e.categoryFocus ?? "—"}
                  {e.upcomingUplift ? t("upcomingEvents.upliftSuffix", { pct: fmtPct(e.upcomingUplift.upliftEstimasi) }) : ""}
                </div>
              </li>
            ))}
            {upcoming.length === 0 && <p className="text-sm text-neutral-400">{t("upcomingEvents.empty")}</p>}
          </ul>
        </Card>

        <Card title={t("alertFeed.title")} subtitle={t("alertFeed.subtitle")}>
          <ul className="flex flex-col gap-3">
            {alerting.map((a) => (
              <li key={a.id} className={`${subtlePanelCls} p-3`}>
                <div className="text-sm">
                  <span className="font-semibold">{tShared(`alarmLabels.${alarmLabelKey(a.alarmLabel)}`)}</span> · {a.name} — CUSUM {a.cusum}
                </div>
                {a.lastAlertAction && (
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {t("alertFeed.lastMarked", {
                      action: tShared(`alertActions.${a.lastAlertAction.action}`),
                      date: fmtDate(a.lastAlertAction.createdAt),
                    })}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => logAction(a, "tindak_lanjut")}
                    disabled={loggingId === a.id}
                    className="rounded-md bg-admin-accent px-2 py-1 text-[11px] text-white hover:bg-admin-accent-strong disabled:opacity-50"
                  >
                    {t("alertFeed.followUp")}
                  </button>
                  <button
                    onClick={() => logAction(a, "diabaikan")}
                    disabled={loggingId === a.id}
                    className={btnSecondarySmCls}
                  >
                    {t("alertFeed.ignore")}
                  </button>
                  <button
                    onClick={() => logAction(a, "salah_alarm")}
                    disabled={loggingId === a.id}
                    className={btnSecondarySmCls}
                  >
                    {t("alertFeed.falseAlarm")}
                  </button>
                </div>
              </li>
            ))}
            {alerting.length === 0 && <p className="text-sm text-neutral-400">{t("alertFeed.empty")}</p>}
          </ul>
        </Card>
      </div>

      <Card title={t("sentiment.title")} subtitle={t("sentiment.subtitle")}>
        <table className="w-full min-w-[420px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={thCls}>{t("sentiment.columns.product")}</th>
              <th className={thCls}>{t("sentiment.columns.positive")}</th>
              <th className={thCls}>{t("sentiment.columns.negative")}</th>
              <th className={thCls}>{t("sentiment.columns.neutral")}</th>
            </tr>
          </thead>
          <tbody>
            {sentiment.slice(0, 10).map((s) => (
              <tr key={s.id}>
                <td className={tdCls}>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-[11px] text-neutral-400">{s.brand}</div>
                </td>
                <td className={`${tdCls} text-admin-success`}>{s.positive}</td>
                <td className={`${tdCls} text-admin-danger`}>{s.negative}</td>
                <td className={tdCls}>{s.neutral}</td>
              </tr>
            ))}
            {sentiment.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={4}>
                  {t("sentiment.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DetailSkuTab({
  analytics,
  events,
  selectedProductId,
  setSelectedProductId,
}: {
  analytics: AnalyticsRow[];
  events: EventAnalyticsRow[];
  selectedProductId: string | null;
  setSelectedProductId: (id: string) => void;
}) {
  const t = useTranslations("admin.forecasting.sku");
  const [search, setSearch] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideHistory, setOverrideHistory] = useState<{ id: string; overrideValue: number; reason: string; createdAt: string }[]>([]);

  const product = analytics.find((a) => a.id === selectedProductId) ?? analytics[0] ?? null;
  const filtered = analytics.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!product) return;
    fetch(`/api/admin/analytics/override?productId=${product.id}`)
      .then((r) => r.json())
      .then((d) => setOverrideHistory(d.history ?? []));
  }, [product?.id]);

  async function saveOverride() {
    if (!product || !overrideValue || !overrideReason.trim()) return;
    setSavingOverride(true);
    try {
      await fetch("/api/admin/analytics/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, overrideValue: Number(overrideValue), reason: overrideReason.trim() }),
      });
      setOverrideValue("");
      setOverrideReason("");
      const d = await (await fetch(`/api/admin/analytics/override?productId=${product.id}`)).json();
      setOverrideHistory(d.history ?? []);
    } finally {
      setSavingOverride(false);
    }
  }

  if (!product) {
    return (
      <Card title={t("pickSku.title")}>
        <p className="text-sm text-neutral-400">{t("noProduct")}</p>
      </Card>
    );
  }

  const relatedEvents = events.filter((e) => e.categoryFocus === product.category);
  const trendLabel = product.trend === "up" ? t("detail.trendUp") : product.trend === "down" ? t("detail.trendDown") : t("detail.trendFlat");
  const signalLabel = (signal: string) => (signal === "Add-to-cart" ? t("signalBreakdown.cartAdd") : t("signalBreakdown.chatMention"));

  return (
    <div className="flex flex-col gap-5">
      <Card title={t("pickSku.title")}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pickSku.searchPlaceholder")} className={`${inputCls} w-full max-w-sm`} />
        <div className="mt-3 flex flex-wrap gap-2">
          {filtered.slice(0, 15).map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedProductId(a.id)}
              className={`rounded-full border px-3 py-1 text-[12px] ${
                a.id === product.id ? "border-admin-accent/40 bg-admin-accent/10 font-medium text-admin-accent-strong" : "border-white/70 bg-white/40 text-neutral-700 hover:bg-white/70"
              }`}
            >
              {a.name}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-neutral-400">{t("pickSku.noMatch")}</p>}
        </div>
      </Card>

      <Card
        title={product.name}
        subtitle={`${product.brand ?? "—"} · ${product.category ?? "—"} · Rp ${Number(product.price).toLocaleString("id-ID")}`}
      >
        <ForecastChart series={product.series} />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label={t("detail.forecastNextHour")} value={String(product.forecastNextHour)} />
          <MiniStat label={t("detail.trend")} value={trendLabel} />
          <MiniStat label={t("detail.dataPointsLabel")} value={t("detail.dataPoints", { count: product.dataPoints })} />
          <MiniStat label={t("detail.stock")} value={String(product.stock_quantity)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t("signalBreakdown.title")} subtitle={t("signalBreakdown.subtitle")}>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={thCls}>{t("signalBreakdown.columns.signal")}</th>
                <th className={thCls}>{t("signalBreakdown.columns.valueNow")}</th>
                <th className={thCls}>{t("signalBreakdown.columns.zScore")}</th>
                <th className={thCls}>{t("signalBreakdown.columns.weight")}</th>
              </tr>
            </thead>
            <tbody>
              {product.signalBreakdown.map((s) => (
                <tr key={s.signal}>
                  <td className={tdCls}>{signalLabel(s.signal)}</td>
                  <td className={tdCls}>{s.value}</td>
                  <td className={tdCls}>{s.z}</td>
                  <td className={tdCls}>{s.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={t("relatedEvents.title")} subtitle={t("relatedEvents.subtitle")}>
          <ul className="flex flex-col gap-2">
            {relatedEvents.map((e) => (
              <li key={e.id} className={`${subtlePanelCls} p-2.5 text-sm`}>
                <div className="font-semibold">{e.name}</div>
                <div className="text-[11px] text-neutral-400">
                  {fmtDate(e.startsAt)} ·{" "}
                  {e.historicalUplift ? fmtPct(e.historicalUplift.upliftBersih) : e.upcomingUplift ? fmtPct(e.upcomingUplift.upliftEstimasi) : "—"}
                </div>
              </li>
            ))}
            {relatedEvents.length === 0 && <p className="text-sm text-neutral-400">{t("relatedEvents.empty")}</p>}
          </ul>
        </Card>
      </div>

      <Card title={t("override.title")} subtitle={t("override.subtitle")}>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">{t("override.currentForecast")}</label>
            <div className="glass-inset rounded-xl px-3 py-2 text-sm font-semibold">{product.forecastNextHour}</div>
          </div>
          <input value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} placeholder={t("override.valuePlaceholder")} className={inputCls} />
          <input
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder={t("override.reasonPlaceholder")}
            className={`${inputCls} min-w-[240px] flex-1`}
          />
          <button
            onClick={saveOverride}
            disabled={savingOverride}
            className={btnPrimaryCls}
          >
            {savingOverride ? t("override.saving") : t("override.save")}
          </button>
        </div>
        {overrideHistory.length > 0 && (
          <table className="mt-4 w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={thCls}>{t("override.historyColumns.date")}</th>
                <th className={thCls}>{t("override.historyColumns.value")}</th>
                <th className={thCls}>{t("override.historyColumns.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {overrideHistory.map((h) => (
                <tr key={h.id}>
                  <td className={tdCls}>{fmtDate(h.createdAt)}</td>
                  <td className={tdCls}>{h.overrideValue}</td>
                  <td className={tdCls}>{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function EventPlannerTab({
  events,
  reloadEvents,
  attributionSummary,
  eventSubTab,
  setEventSubTab,
}: {
  events: EventAnalyticsRow[];
  reloadEvents: () => void;
  attributionSummary: { totalSessions: number; organikSessions: number };
  eventSubTab: "timeline" | "table" | "eval";
  setEventSubTab: (t: "timeline" | "table" | "eval") => void;
}) {
  const t = useTranslations("admin.forecasting.events");
  const tShared = useTranslations("admin.forecasting.shared");
  const [selectedEvent, setSelectedEvent] = useState<EventAnalyticsRow | null>(null);
  const [newEvent, setNewEvent] = useState({
    name: "",
    type: "promo_marketplace",
    subType: "",
    startsAt: "",
    endsAt: "",
    categoryFocus: "",
    discountPct: "",
    adBudget: "",
    promoCode: "",
  });
  const [whatif, setWhatif] = useState({ categoryFocus: "", subType: "", discountPct: "" });
  const [whatifResult, setWhatifResult] = useState<{
    upliftEstimasi: number | null;
    basis: "lookup" | "estimasi_kasar";
    historicalEventsUsed: number;
    projectedValueProxy: number | null;
    note: string;
  } | null>(null);
  const [whatifLoading, setWhatifLoading] = useState(false);

  async function runWhatif() {
    if (!whatif.categoryFocus.trim()) return;
    setWhatifLoading(true);
    try {
      const params = new URLSearchParams({ categoryFocus: whatif.categoryFocus.trim() });
      if (whatif.subType.trim()) params.set("subType", whatif.subType.trim());
      if (whatif.discountPct) params.set("discountPct", whatif.discountPct);
      const res = await fetch(`/api/admin/events/whatif?${params.toString()}`);
      setWhatifResult(await res.json());
    } finally {
      setWhatifLoading(false);
    }
  }

  async function addEvent() {
    if (!newEvent.name.trim() || !newEvent.startsAt || !newEvent.endsAt) return;
    await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newEvent.name.trim(),
        type: newEvent.type,
        subType: newEvent.subType.trim() || undefined,
        startsAt: new Date(newEvent.startsAt).toISOString(),
        endsAt: new Date(newEvent.endsAt).toISOString(),
        categoryFocus: newEvent.categoryFocus.trim() || undefined,
        discountPct: newEvent.discountPct ? Number(newEvent.discountPct) : undefined,
        adBudget: newEvent.adBudget ? Number(newEvent.adBudget) : undefined,
        promoCode: newEvent.promoCode.trim() || undefined,
      }),
    });
    setNewEvent({ name: "", type: "promo_marketplace", subType: "", startsAt: "", endsAt: "", categoryFocus: "", discountPct: "", adBudget: "", promoCode: "" });
    reloadEvents();
  }
  async function setEventStatus(id: string, status: string) {
    await fetch(`/api/admin/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reloadEvents();
  }
  async function deleteEventRow(id: string) {
    await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    reloadEvents();
  }
  async function toggleMilestone(event: EventAnalyticsRow, key: string, done: boolean) {
    const next = done ? [...event.milestonesDone, key] : event.milestonesDone.filter((k) => k !== key);
    await fetch(`/api/admin/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestonesDone: next }),
    });
    setSelectedEvent((prev) => (prev && prev.id === event.id ? { ...prev, milestonesDone: next } : prev));
    reloadEvents();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <SubTabButton active={eventSubTab === "timeline"} onClick={() => setEventSubTab("timeline")}>
          {t("subTabs.timeline")}
        </SubTabButton>
        <SubTabButton active={eventSubTab === "table"} onClick={() => setEventSubTab("table")}>
          {t("subTabs.table")}
        </SubTabButton>
        <SubTabButton active={eventSubTab === "eval"} onClick={() => setEventSubTab("eval")}>
          {t("subTabs.eval")}
        </SubTabButton>
      </div>

      {eventSubTab === "timeline" && (
        <>
          <Card title={t("timeline.cardTitle")} subtitle={t("timeline.cardSubtitle")}>
            <EventTimeline events={events} onSelect={setSelectedEvent} selectedId={selectedEvent?.id} />
          </Card>
          {selectedEvent && (
            <Card
              title={selectedEvent.name}
              subtitle={`${fmtDate(selectedEvent.startsAt)} – ${fmtDate(selectedEvent.endsAt)} · ${selectedEvent.categoryFocus ?? "—"} · ${tShared(`eventStatus.${selectedEvent.status}`)}`}
            >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t("detail.upliftTitle")}</h3>
                  {selectedEvent.historicalUplift ? (
                    <p className="text-sm">
                      <span className="font-bold">{fmtPct(selectedEvent.historicalUplift.upliftBersih)}</span> — {tShared("uplift.tingkatC")},{" "}
                      {selectedEvent.historicalUplift.significant ? tShared("uplift.signifikan") : tShared("uplift.tidakSignifikan")}
                    </p>
                  ) : selectedEvent.upcomingUplift ? (
                    <p className="text-sm">
                      <span className="font-bold">{fmtPct(selectedEvent.upcomingUplift.upliftEstimasi)}</span> —{" "}
                      {selectedEvent.upcomingUplift.basis === "lookup" ? tShared("uplift.lookupSubtipe") : tShared("uplift.estimasiKasar")}
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-400">{t("detail.notComputable")}</p>
                  )}

                  <h3 className="mb-2 mt-4 text-sm font-semibold text-neutral-700">{t("detail.attributionTitle")}</h3>
                  {selectedEvent.promoCode ? (
                    <p className="text-sm">
                      {t("detail.attributionLine", {
                        code: selectedEvent.promoCode,
                        sessions: selectedEvent.attribution?.sessions ?? 0,
                        mentions: selectedEvent.attribution?.mentions ?? 0,
                        cost: selectedEvent.attribution?.costPerSession
                          ? t("detail.attributionCostSuffix", { amount: Math.round(selectedEvent.attribution.costPerSession).toLocaleString("id-ID") })
                          : "",
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-400">{t("detail.noPromoCode")}</p>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t("detail.milestonesTitle")}</h3>
                  <MilestoneChecklist event={selectedEvent} onToggle={(k, d) => toggleMilestone(selectedEvent, k, d)} />
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {eventSubTab === "table" && (
        <Card title={t("table.cardTitle")} subtitle={t("table.cardSubtitle")}>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              value={newEvent.name}
              onChange={(e) => setNewEvent((s) => ({ ...s, name: e.target.value }))}
              placeholder={t("table.namePlaceholder")}
              className={`${inputCls} col-span-2`}
            />
            <select value={newEvent.type} onChange={(e) => setNewEvent((s) => ({ ...s, type: e.target.value }))} className={inputCls}>
              {EVENT_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {tShared(`eventTypes.${value}`)}
                </option>
              ))}
            </select>
            <input
              value={newEvent.subType}
              onChange={(e) => setNewEvent((s) => ({ ...s, subType: e.target.value }))}
              placeholder={t("table.subTypePlaceholder")}
              className={inputCls}
            />
            <input type="datetime-local" value={newEvent.startsAt} onChange={(e) => setNewEvent((s) => ({ ...s, startsAt: e.target.value }))} className={inputCls} />
            <input type="datetime-local" value={newEvent.endsAt} onChange={(e) => setNewEvent((s) => ({ ...s, endsAt: e.target.value }))} className={inputCls} />
            <input
              value={newEvent.categoryFocus}
              onChange={(e) => setNewEvent((s) => ({ ...s, categoryFocus: e.target.value }))}
              placeholder={t("table.categoryPlaceholder")}
              className={inputCls}
            />
            <input
              value={newEvent.discountPct}
              onChange={(e) => setNewEvent((s) => ({ ...s, discountPct: e.target.value }))}
              placeholder={t("table.discountPlaceholder")}
              className={inputCls}
            />
            <input
              value={newEvent.adBudget}
              onChange={(e) => setNewEvent((s) => ({ ...s, adBudget: e.target.value }))}
              placeholder={t("table.budgetPlaceholder")}
              className={inputCls}
            />
            <input
              value={newEvent.promoCode}
              onChange={(e) => setNewEvent((s) => ({ ...s, promoCode: e.target.value.toUpperCase() }))}
              placeholder={t("table.promoCodePlaceholder")}
              className={inputCls}
            />
            <button onClick={addEvent} className={btnPrimaryCls}>
              {t("table.addButton")}
            </button>
          </div>
          <table className="w-full min-w-[760px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={thCls}>{t("table.columns.event")}</th>
                <th className={thCls}>{t("table.columns.date")}</th>
                <th className={thCls}>{t("table.columns.category")}</th>
                <th className={thCls}>{t("table.columns.discount")}</th>
                <th className={thCls}>{t("table.columns.promoCode")}</th>
                <th className={thCls}>{t("table.columns.status")}</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className={tdCls}>
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-[11px] text-neutral-400">
                      {EVENT_TYPE_VALUES.includes(e.type as (typeof EVENT_TYPE_VALUES)[number]) ? tShared(`eventTypes.${e.type}`) : e.type}
                      {e.subType ? ` · ${e.subType}` : ""}
                    </div>
                  </td>
                  <td className={tdCls}>
                    {fmtDate(e.startsAt)} – {fmtDate(e.endsAt)}
                  </td>
                  <td className={tdCls}>{e.categoryFocus ?? "—"}</td>
                  <td className={tdCls}>{e.discountPct !== null ? `${e.discountPct}%` : "—"}</td>
                  <td className={tdCls}>{e.promoCode ?? "—"}</td>
                  <td className={tdCls}>
                    <select
                      value={e.status}
                      onChange={(ev) => setEventStatus(e.id, ev.target.value)}
                      className="glass-field glass-inset h-7 rounded-full px-2.5 text-[11px] text-neutral-700 focus:outline-none focus:ring-4 focus:ring-admin-accent/15"
                    >
                      {EVENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tShared(`eventStatus.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={tdCls}>
                    <button onClick={() => deleteEventRow(e.id)} className="text-[11px] font-medium text-admin-danger hover:underline">
                      {t("table.deleteButton")}
                    </button>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td className={tdCls} colSpan={7}>
                    {t("table.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {eventSubTab === "eval" && (
        <>
          <Card title={t("eval.upliftCard.title")} subtitle={t("eval.upliftCard.subtitle")}>
            <table className="w-full min-w-[560px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={thCls}>{t("eval.upliftCard.columns.event")}</th>
                  <th className={thCls}>{t("eval.upliftCard.columns.status")}</th>
                  <th className={thCls}>{t("eval.upliftCard.columns.uplift")}</th>
                  <th className={thCls}>{t("eval.upliftCard.columns.method")}</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .filter((e) => e.historicalUplift || e.upcomingUplift)
                  .map((e) => (
                    <tr key={e.id}>
                      <td className={tdCls}>
                        <div className="font-semibold">{e.name}</div>
                        <div className="text-[11px] text-neutral-400">{e.categoryFocus ?? "—"}</div>
                      </td>
                      <td className={tdCls}>{tShared(`eventStatus.${e.status}`)}</td>
                      <td className={`${tdCls} font-bold`}>
                        {e.historicalUplift ? fmtPct(e.historicalUplift.upliftBersih) : e.upcomingUplift ? fmtPct(e.upcomingUplift.upliftEstimasi) : "—"}
                      </td>
                      <td className={tdCls}>
                        {e.historicalUplift ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              e.historicalUplift.significant ? "bg-admin-success/10 text-admin-success" : "bg-white/60 text-admin-nav-ink"
                            }`}
                          >
                            {tShared("uplift.tingkatC")} · {e.historicalUplift.significant ? tShared("uplift.signifikan") : tShared("uplift.tidakSignifikan")}
                          </span>
                        ) : e.upcomingUplift ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              e.upcomingUplift.basis === "lookup" ? "bg-admin-accent/10 text-admin-accent-strong" : "bg-admin-warning/15 text-[#9a6b06]"
                            }`}
                          >
                            {e.upcomingUplift.basis === "lookup" ? tShared("uplift.lookupSubtipe") : tShared("uplift.estimasiKasar")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                {events.filter((e) => e.historicalUplift || e.upcomingUplift).length === 0 && (
                  <tr>
                    <td className={tdCls} colSpan={4}>
                      {t("eval.upliftCard.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card
            title={t("eval.attributionCard.title")}
            subtitle={t("eval.attributionCard.subtitleTemplate", {
              organik: attributionSummary.organikSessions,
              total: attributionSummary.totalSessions,
            })}
          >
            <table className="w-full min-w-[560px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={thCls}>{t("eval.attributionCard.columns.promoCode")}</th>
                  <th className={thCls}>{t("eval.attributionCard.columns.event")}</th>
                  <th className={thCls}>{t("eval.attributionCard.columns.sessions")}</th>
                  <th className={thCls}>{t("eval.attributionCard.columns.mentions")}</th>
                  <th className={thCls}>{t("eval.attributionCard.columns.costPerSession")}</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .filter((e) => e.promoCode)
                  .map((e) => (
                    <tr key={e.id}>
                      <td className={tdCls}>{e.promoCode}</td>
                      <td className={tdCls}>{e.name}</td>
                      <td className={tdCls}>{e.attribution?.sessions ?? 0}</td>
                      <td className={tdCls}>{e.attribution?.mentions ?? 0}</td>
                      <td className={tdCls}>
                        {e.attribution?.costPerSession ? `Rp ${Math.round(e.attribution.costPerSession).toLocaleString("id-ID")}` : "—"}
                      </td>
                    </tr>
                  ))}
                {events.filter((e) => e.promoCode).length === 0 && (
                  <tr>
                    <td className={tdCls} colSpan={5}>
                      {t("eval.attributionCard.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card title={t("eval.simulatorCard.title")} subtitle={t("eval.simulatorCard.subtitle")}>
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                value={whatif.categoryFocus}
                onChange={(e) => setWhatif((s) => ({ ...s, categoryFocus: e.target.value }))}
                placeholder={t("eval.simulatorCard.categoryPlaceholder")}
                className={inputCls}
              />
              <input
                value={whatif.subType}
                onChange={(e) => setWhatif((s) => ({ ...s, subType: e.target.value }))}
                placeholder={t("eval.simulatorCard.subTypePlaceholder")}
                className={inputCls}
              />
              <input
                value={whatif.discountPct}
                onChange={(e) => setWhatif((s) => ({ ...s, discountPct: e.target.value }))}
                placeholder={t("eval.simulatorCard.discountPlaceholder")}
                className={inputCls}
              />
              <button
                onClick={runWhatif}
                disabled={whatifLoading}
                className={btnPrimaryCls}
              >
                {whatifLoading ? t("eval.simulatorCard.calculating") : t("eval.simulatorCard.calculate")}
              </button>
            </div>
            {whatifResult && (
              <div className={`${subtlePanelCls} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{fmtPct(whatifResult.upliftEstimasi)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      whatifResult.basis === "lookup" ? "bg-admin-accent/10 text-admin-accent-strong" : "bg-admin-warning/15 text-[#9a6b06]"
                    }`}
                  >
                    {whatifResult.basis === "lookup" ? tShared("uplift.lookupSubtipe") : tShared("uplift.estimasiKasar")}
                  </span>
                  <span className="text-[11px] text-neutral-400">{t("eval.simulatorCard.fromEvents", { count: whatifResult.historicalEventsUsed })}</span>
                </div>
                {whatifResult.projectedValueProxy !== null && (
                  <p className="mt-2 text-sm text-neutral-700">
                    {t("eval.simulatorCard.projectedValue", { amount: `Rp ${Math.round(whatifResult.projectedValueProxy).toLocaleString("id-ID")}` })}
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">{t("eval.simulatorCard.note")}</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function MarketingTab({
  events,
  attributionSummary,
  goToAttribution,
}: {
  events: EventAnalyticsRow[];
  attributionSummary: { totalSessions: number; organikSessions: number };
  goToAttribution: () => void;
}) {
  const t = useTranslations("admin.forecasting.marketing");

  const phase = (label: string, status: "live" | "planned", desc: string) => (
    <div className={`flex items-start gap-3 ${subtlePanelCls} p-3`}>
      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${status === "live" ? "bg-admin-success" : "bg-admin-taupe-strong"}`} />
      <div>
        <div className="text-sm font-semibold text-neutral-700">
          {label}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${status === "live" ? "bg-admin-success/10 text-admin-success" : "bg-white/60 text-admin-nav-ink"}`}>
            {status === "live" ? t("statusLive") : t("statusPlanned")}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{desc}</p>
      </div>
    </div>
  );

  const promoEvents = events.filter((e) => e.promoCode);
  const totalSessions = promoEvents.reduce((s, e) => s + (e.attribution?.sessions ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-neutral-700">{t("title")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">{t("intro")}</p>
      </div>

      <Card title={t("measurableCard.title")}>
        <div className="flex flex-col gap-2">
          {phase(t("measurableCard.promoCodeTitle"), "live", t("measurableCard.promoCodeDesc"))}
          {phase(t("measurableCard.channelRoasTitle"), "planned", t("measurableCard.channelRoasDesc"))}
          {phase(t("measurableCard.mmmTitle"), "planned", t("measurableCard.mmmDesc"))}
          {phase(t("measurableCard.incrementalityTitle"), "planned", t("measurableCard.incrementalityDesc"))}
        </div>
      </Card>

      <Card
        title={t("promoChannelCard.title")}
        subtitle={t("promoChannelCard.subtitleTemplate", {
          organik: attributionSummary.organikSessions,
          total: attributionSummary.totalSessions,
          attributed: totalSessions,
          eventCount: promoEvents.length,
        })}
      >
        {promoEvents.length === 0 ? (
          <p className="text-sm text-neutral-400">{t("promoChannelCard.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {promoEvents.map((e) => (
              <li key={e.id} className={`flex items-center justify-between ${subtlePanelCls} p-2.5 text-sm`}>
                <span>
                  <span className="font-semibold">{e.promoCode}</span> · {e.name}
                </span>
                <span className="text-neutral-500">
                  {e.attribution?.sessions ?? 0}
                  {t("promoChannelCard.sessionsSuffix")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button onClick={goToAttribution} className={`mt-3 text-[11px] ${linkAccentCls}`}>
          {t("promoChannelCard.viewDetail")}
        </button>
      </Card>
    </div>
  );
}

/** Auto-generated top insight shown at the top of Forecasting — refreshed
 * at most once a day server-side (lib/admin/insight-summary-cache.ts).
 * Reuses the same Vera Intelligence backend as the full chat section. */
function DailyInsightCard({ onOpenInsight }: { onOpenInsight: () => void }) {
  const t = useTranslations("admin.insight");
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load(refresh = false) {
    setLoading(true);
    fetch(`/api/admin/insight/summary${refresh ? "?refresh=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { text: string }) => setText(d.text))
      .catch(() => setText(t("error")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${subtlePanelCls} flex flex-col gap-2 p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-admin-ink">
          <IconSparkle size={16} />
          {t("dailyCard.title")}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => load(true)} disabled={loading} className={linkAccentCls}>
            {t("dailyCard.refresh")}
          </button>
          <button onClick={onOpenInsight} className={linkAccentCls}>
            {t("dailyCard.askMore")}
          </button>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-neutral-600">{loading ? t("dailyCard.loading") : text}</p>
    </div>
  );
}

function ForecastingSection({ onOpenInsight }: { onOpenInsight: () => void }) {
  const t = useTranslations("admin.forecasting");
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [events, setEvents] = useState<EventAnalyticsRow[]>([]);
  const [attributionSummary, setAttributionSummary] = useState({ totalSessions: 0, organikSessions: 0 });
  const [sentiment, setSentiment] = useState<SentimentRow[]>([]);
  const [tab, setTab] = useState<"overview" | "sku" | "events" | "marketing">("overview");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [eventSubTab, setEventSubTab] = useState<"timeline" | "table" | "eval">("timeline");

  function loadAnalytics() {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d) => setAnalytics(d.products ?? []));
  }
  function loadEvents() {
    fetch("/api/admin/events/analytics")
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setAttributionSummary(d.attributionSummary ?? { totalSessions: 0, organikSessions: 0 });
      });
  }
  function loadSentiment() {
    fetch("/api/admin/sentiment")
      .then((r) => r.json())
      .then((d) => setSentiment(d.products ?? []));
  }

  useEffect(() => {
    loadAnalytics();
    loadEvents();
    loadSentiment();
  }, []);

  function goToDetail(productId: string) {
    setSelectedProductId(productId);
    setTab("sku");
  }
  function goToAttribution() {
    setTab("events");
    setEventSubTab("eval");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-700">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">{t("intro")}</p>
      </div>

      <DailyInsightCard onOpenInsight={onOpenInsight} />

      <div className="flex flex-wrap gap-2 border-b border-white/60 pb-3">
        {UPLIFT_TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === id ? "bg-admin-accent text-white shadow-[0_8px_20px_-8px_rgb(210_98_135/0.7)]" : "text-admin-nav-ink hover:bg-white/50"}`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab analytics={analytics} events={events} sentiment={sentiment} onSelectProduct={goToDetail} reloadAnalytics={loadAnalytics} />
      )}
      {tab === "sku" && (
        <DetailSkuTab analytics={analytics} events={events} selectedProductId={selectedProductId} setSelectedProductId={setSelectedProductId} />
      )}
      {tab === "events" && (
        <EventPlannerTab
          events={events}
          reloadEvents={loadEvents}
          attributionSummary={attributionSummary}
          eventSubTab={eventSubTab}
          setEventSubTab={setEventSubTab}
        />
      )}
      {tab === "marketing" && <MarketingTab events={events} attributionSummary={attributionSummary} goToAttribution={goToAttribution} />}
    </div>
  );
}

function SimulatorSection() {
  const t = useTranslations("admin.simulator");
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function ensureSession() {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/widget/session", { method: "POST" });
    const data = await res.json();
    sessionRef.current = data.sessionId;
    return data.sessionId as string;
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const sessionId = await ensureSession();
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ sessionId, conversationId: conversationRef.current, message: text }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const frame = JSON.parse(line.slice(5).trim());
          if (frame.type === "start") conversationRef.current = frame.payload.conversationId;
          if (frame.type === "done") {
            const answer = String(frame.payload.answer ?? "").trim();
            setMessages((m) => [...m, { role: "bot", text: answer, products: frame.payload.products }]);
          }
          if (frame.type === "error") {
            setMessages((m) => [...m, { role: "bot", text: t("serverError") }]);
          }
        }
      }
    } catch {
      setMessages((m) => [...m, { role: "bot", text: t("connectionError") }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-700">{t("title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t.rich("subtitle", { code: (chunks) => <code>{chunks}</code> })}</p>
      </div>
      <div className="glass-card mx-auto w-full max-w-2xl overflow-hidden rounded-[24px]">
        <div ref={scrollRef} className="no-scrollbar flex h-[520px] flex-col gap-3 overflow-y-auto p-5">
          {messages.length === 0 && <p className="text-center text-sm text-neutral-400">{t("emptyState")}</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "bot" && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-admin-accent text-white">
                  <IconSparkle size={14} />
                </span>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "rounded-br-md bg-admin-accent text-white" : "rounded-bl-md border border-white/80 bg-white/70 text-neutral-700"}`}>
                {m.text?.includes("[Skin Scanning Analysis Tool]") ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static asset, fixed small size */}
                    <img src="/assets/chat/skin-scan-analysis.png" alt={t("skinTool")} className="h-auto w-[100px] rounded-[10px] object-cover shadow-sm" />
                    <span className="text-[11px] font-medium text-neutral-500">{t("skinTool")}</span>
                  </div>
                ) : m.text?.includes("[Track Your Progress]") ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static asset, fixed small size */}
                    <img src="/assets/chat/track-progress.png" alt={t("trackProgress")} className="h-auto w-[100px] rounded-[10px] object-cover shadow-sm" />
                    <span className="text-[11px] font-medium text-neutral-500">{t("trackProgress")}</span>
                  </div>
                ) : (
                  <>
                    {m.text}
                    {m.products && m.products.length > 0 && (
                      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
                        {m.products.slice(0, 3).map((p, j) => (
                          <div key={j} className="w-32 shrink-0 rounded-xl border border-white/80 bg-white/70 p-2 text-neutral-700">
                            {/* eslint-disable-next-line @next/next/no-img-element -- remote retailer CDN, not in next/image remotePatterns */}
                            <img src={p.imageUrl || "/product.png"} alt={p.name} className="mb-2 h-20 w-full rounded-lg bg-white/60 object-cover" />
                            <div className="truncate text-[10px] font-bold">{p.name}</div>
                            <div className="truncate text-[9px] text-neutral-500">{p.brand}</div>
                            <div className="mt-1 flex flex-col gap-1">
                              {p.colorPalette && p.colorPalette.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {p.colorPalette.map((hex, idx) => (
                                    <div key={idx} className="h-2 w-2 rounded-full border border-white/90 ring-1 ring-black/10" style={{ backgroundColor: hex }} title={hex} />
                                  ))}
                                </div>
                              )}
                              {p.sizeLabel && <div className="truncate text-[8px] font-medium italic text-neutral-500">{p.sizeLabel}</div>}
                            </div>
                            <div className="mt-1 text-[10px] font-semibold text-admin-accent-strong">
                              {p.price != null ? `Rp ${Number(p.price).toLocaleString("id-ID")}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-end justify-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-admin-accent text-white">
                <IconSparkle size={14} />
              </span>
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/80 bg-white/70 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-white/60 bg-white/25 p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t("placeholder")}
            className={`${inputCls} flex-1`}
          />
          <button onClick={send} disabled={sending} className={btnPrimaryCls}>
            {t("send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function IntegrationSection() {
  const t = useTranslations("admin.integration");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const snippet = `<script src="${origin}/widget-loader.js" async></script>`;

  function copy() {
    navigator.clipboard?.writeText(snippet).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-neutral-700">{t("title")}</h1>
      <Card title={t("embedCardTitle")} subtitle={t("embedCardSubtitle")}>
        <pre className="overflow-x-auto rounded-xl bg-neutral-700 p-4 text-xs text-neutral-100">{snippet}</pre>
        <button onClick={copy} className={`mt-3 ${btnSecondaryCls}`}>
          {t("copyButton")}
        </button>
      </Card>
      <Card title={t("previewCardTitle")} subtitle={t("previewCardSubtitle")}>
        <div className="overflow-hidden rounded-2xl border border-white/70">
          <iframe src="/demo-retailer.html" className="h-[520px] w-full" title="Widget preview" />
        </div>
      </Card>
    </div>
  );
}

interface ConversationSessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  conversation_count: number;
  message_count: number;
  first_user_message: string | null;
}

interface ConversationMessageRow {
  id: string;
  role: "user" | "bot";
  text: string | null;
  created_at: string;
  conversation_id: string;
  products: ProductCardData[];
}

function formatDateTime(value: string, tag: string) {
  return new Date(value).toLocaleString(tag, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConversationsSection() {
  const t = useTranslations("admin.conversations");
  const tag = useLocale() === "id" ? "id-ID" : "en-US";
  const fmt = (v: string) => formatDateTime(v, tag);
  const [sessions, setSessions] = useState<ConversationSessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    fetch("/api/admin/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  function selectSession(id: string) {
    setSelectedId(id);
    setLoadingMessages(true);
    setMessages([]);
    fetch(`/api/admin/sessions/${id}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-700">{t("title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>
      </div>
      <div className="glass-card flex h-[640px] overflow-hidden rounded-[24px]">
        <div className="no-scrollbar flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/60 p-3">
          {sessions.length === 0 && <p className="p-3 text-sm text-neutral-500">{t("empty")}</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSession(s.id)}
              aria-current={selectedId === s.id ? "true" : undefined}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                selectedId === s.id ? "border-admin-accent/30 bg-admin-accent/10" : "border-transparent hover:bg-white/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-[11px] ${selectedId === s.id ? "font-medium text-admin-accent-strong" : "text-neutral-500"}`}>
                  {t("session", { id: s.id.slice(0, 8) })}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">{fmt(s.last_seen_at)}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-[13px] font-medium text-neutral-700">
                {s.first_user_message?.trim() || <span className="font-normal text-neutral-500">{t("noMessageYet")}</span>}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                {t("counts", { messages: s.message_count, conversations: s.conversation_count })}
              </div>
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-white/20">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-neutral-500">{t("selectPrompt")}</p>
            </div>
          ) : (
            <>
              <div className="border-b border-white/60 bg-white/35 px-6 py-4">
                <div className="text-sm font-semibold text-neutral-700">{t("session", { id: selected.id.slice(0, 8) })}</div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {t("startedAt", { date: fmt(selected.created_at) })} ·{" "}
                  {t("counts", { messages: selected.message_count, conversations: selected.conversation_count })}
                </div>
              </div>
              <div className="no-scrollbar flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-2xl flex-col gap-3">
                  {loadingMessages && <p className="text-center text-sm text-neutral-500">{t("loading")}</p>}
                  {!loadingMessages && messages.length === 0 && <p className="text-center text-sm text-neutral-500">{t("noMessages")}</p>}
                  {messages.map((m, i) => {
                    const newConversation = i > 0 && messages[i - 1].conversation_id !== m.conversation_id;
                    return (
                      <div key={m.id} className="flex flex-col gap-3">
                        {newConversation && (
                          <div className="my-1 flex items-center gap-3">
                            <div className="h-px flex-1 bg-white/80" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t("newConversation")}</span>
                            <div className="h-px flex-1 bg-white/80" />
                          </div>
                        )}
                        <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                              m.role === "user" ? "rounded-br-md bg-admin-accent text-white" : "rounded-bl-md border border-white/80 bg-white/70 text-neutral-700"
                            }`}
                          >
                            <div className="whitespace-pre-wrap">{m.text}</div>
                            {m.products.length > 0 && <ProductCardRow products={m.products} className="mt-2.5" />}
                            <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-white/75" : "text-neutral-500"}`}>{fmt(m.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminShell() {
  const [section, setSection] = useState<AdminSection>("overview");
  const [catalogQuery, setCatalogQuery] = useState<{ q: string; n: number }>({ q: "", n: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products?: { alarmLevel: number }[] }) => setAlertCount((d.products ?? []).filter((p) => p.alarmLevel >= 1).length))
      .catch(() => {});
  }, []);

  function select(s: AdminSection) {
    setSection(s);
    setDrawerOpen(false);
  }
  function focusSearch() {
    if (window.matchMedia("(min-width: 1024px)").matches) searchRef.current?.focus();
    else setDrawerOpen(true);
  }
  useSearchShortcut(focusSearch);

  const sidebar = (
    <AdminSidebar
      active={section}
      onSelect={select}
      searchRef={searchRef}
      onSearch={(q) => {
        setCatalogQuery((c) => ({ q, n: c.n + 1 }));
        select("catalog");
      }}
    />
  );

  return (
    <AdminFrame
      sidebar={sidebar}
      header={<AdminHeader onMenu={() => setDrawerOpen(true)} onSearchFocus={focusSearch} onSelect={select} alertCount={alertCount} />}
      drawerOpen={drawerOpen}
      onCloseDrawer={() => setDrawerOpen(false)}
    >
      {section === "overview" && <OverviewSection onSelect={select} />}
      {section === "catalog" && <CatalogSection key={catalogQuery.n} initialSearch={catalogQuery.q} />}
      {section === "marketing" && <MarketingSection />}
      {section === "forecasting" && <ForecastingSection onOpenInsight={() => select("insight")} />}
      {section === "insight" && <InsightSection />}
      {section === "simulator" && <SimulatorSection />}
      {section === "integration" && <IntegrationSection />}
      {section === "conversations" && <ConversationsSection />}
    </AdminFrame>
  );
}

export default function AdminPage() {
  return (
    <div
      className="admin-theme fixed inset-0 z-[999999] overflow-hidden bg-neutral-50 font-admin text-admin-ink"
    >
      <AdminShell />
    </div>
  );
}
