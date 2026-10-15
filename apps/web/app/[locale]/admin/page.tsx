"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tenant dashboard — sidebar shell + 6 sections. Deliberately escapes the
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

type Section = "overview" | "catalog" | "marketing" | "forecasting" | "simulator" | "integration";

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
  cart_adds: number;
  chat_mentions: number;
  signal_score: number;
  forecastNextHour: number;
  trend: "up" | "down" | "flat";
  trendValue: number;
  dataPoints: number;
}
interface OverviewData {
  totalProducts: number;
  inStockProducts: number;
  activeBoosts: number;
  widgetSessions: number;
  widgetConversations: number;
  widgetMessages: number;
}
interface SimMessage {
  role: "user" | "bot";
  text: string;
  products?: { name: string; brand?: string; price?: number }[];
}

const inputCls =
  "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const thCls = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-200";
const tdCls = "px-2 py-1.5 text-[13px] text-neutral-800 border-b border-neutral-100 align-top";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-neutral-900">{title}</h2>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{subtitle}</p>}
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

const NAV: { id: Section; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Ringkasan aktivitas" },
  { id: "catalog", label: "Katalog", hint: "Produk, harga, stok" },
  { id: "marketing", label: "Marketing & Trend", hint: "Boost keyword" },
  { id: "forecasting", label: "Forecasting", hint: "Demand signal" },
  { id: "simulator", label: "Chat Simulator", hint: "Uji widget" },
  { id: "integration", label: "Integrasi", hint: "Embed widget" },
];

function Sidebar({ active, onSelect }: { active: Section; onSelect: (s: Section) => void }) {
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
            onClick={() => onSelect(item.id)}
            className={`rounded-lg px-3 py-2.5 text-left text-sm transition ${
              active === item.id ? "bg-primary-dim font-semibold text-primary" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <div>{item.label}</div>
            <div className="text-[11px] font-normal text-neutral-400">{item.hint}</div>
          </button>
        ))}
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

function OverviewSection() {
  const [data, setData] = useState<OverviewData | null>(null);
  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const stat = (label: string, value: number | string) => (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="text-2xl font-bold text-neutral-900">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">Semua angka di bawah ini dibaca langsung dari database, bukan data contoh.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stat("Produk katalog", data?.totalProducts ?? "–")}
        {stat("Stok tersedia", data?.inStockProducts ?? "–")}
        {stat("Boost aktif", data?.activeBoosts ?? "–")}
        {stat("Sesi widget", data?.widgetSessions ?? "–")}
        {stat("Percakapan", data?.widgetConversations ?? "–")}
        {stat("Pesan chat", data?.widgetMessages ?? "–")}
      </div>
    </div>
  );
}

function CatalogSection() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");

  async function loadProducts(q?: string) {
    const res = await fetch(`/api/admin/products${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setProducts(data.products ?? []);
  }
  useEffect(() => {
    loadProducts();
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
      <h1 className="text-2xl font-bold text-neutral-900">Katalog Produk</h1>
      <Card title="Cari & edit produk">
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadProducts(search)}
            placeholder="Cari nama / brand / SKU…"
            className={`${inputCls} min-w-[200px] flex-1`}
          />
          <button onClick={() => loadProducts(search)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
            Cari
          </button>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className={thCls}>Produk</th>
                <th className={thCls}>Harga</th>
                <th className={thCls}>Stok</th>
                <th className={thCls}>Kategori</th>
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
                      className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className={tdCls}>
                    <input
                      type="number"
                      defaultValue={p.stock_quantity}
                      onBlur={(e) => updateProduct(p.id, { stockQuantity: Number(e.target.value) })}
                      className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-xs"
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
      <h1 className="text-2xl font-bold text-neutral-900">Marketing & Trend Boost</h1>
      <Card
        title="Trend / Merchandising Boost"
        subtitle="Keyword di sini ikut menaikkan ranking produk di rekomendasi chat (ranking-only, tidak pernah jadi syarat mutlak) — langsung aktif, tanpa perlu ubah kode."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBoost()}
            placeholder="mis. glass skin, bold red lip"
            className={`${inputCls} min-w-[160px] flex-1`}
          />
          <select value={newWeight} onChange={(e) => setNewWeight(Number(e.target.value))} className={inputCls}>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                Bobot {w}
              </option>
            ))}
          </select>
          <button onClick={addBoost} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            Tambah
          </button>
        </div>
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Keyword</th>
              <th className={thCls}>Bobot</th>
              <th className={thCls}>Status</th>
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
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${b.active ? "border-green-200 bg-green-50 text-green-700" : "border-neutral-200 bg-white text-neutral-500"}`}
                  >
                    {b.active ? "Aktif" : "Nonaktif"}
                  </button>
                </td>
                <td className={tdCls}>
                  <button onClick={() => deleteBoost(b.id)} className="text-[11px] text-red-600 hover:underline">
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {boosts.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={4}>
                  Belum ada boost aktif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ForecastingSection() {
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d) => setAnalytics(d.products ?? []));
  }, []);

  const phase = (n: string, label: string, status: "live" | "planned", desc: string) => (
    <div className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${status === "live" ? "bg-green-500" : "bg-neutral-300"}`} />
      <div>
        <div className="text-sm font-semibold text-neutral-800">
          {n}. {label}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${status === "live" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
            {status === "live" ? "Berjalan" : "Belum tersedia"}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Forecasting</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Mengacu ke roadmap internal 3-fase (lihat Knowledge Base Sistem Analitik Forecasting & Marketing Beauty). Hanya Fase 1 yang
          berjalan dengan data nyata saat ini — Fase 2 dan 3 butuh data warehouse, integrasi marketplace/iklan, dan minimal 12–24 bulan
          histori yang belum ada di project ini, jadi ditandai terus terang sebagai roadmap, bukan fitur aktif.
        </p>
      </div>

      <Card title="Status roadmap (3 fase, 8 bulan)">
        <div className="flex flex-col gap-2">
          {phase("1", "Fondasi data & activity forecast", "live", "Holt's linear trend method (exponential smoothing dengan tren) dijalankan per jam terhadap sinyal cart adds + chat mentions — algoritma forecasting sungguhan, bukan skor statis. Bukan Holt-Winters penuh (belum ada siklus musiman) dan bukan prediksi penjualan (tidak ada tabel order).")}
          {phase("2", "Event, promo, uplift & attribution", "planned", "Butuh kalender event 12 bulan, data belanja iklan, dan kode promo/UTM untuk attribution — belum ada sumber datanya di project ini.")}
          {phase("3", "ML forecasting, MMM, sentiment & simulasi", "planned", "Butuh ≥12 bulan histori penjualan untuk Prophet/LightGBM dan ≥24 bulan data mingguan untuk MMM — datanya belum ada sama sekali (tidak ada tabel order/transaksi di database saat ini).")}
        </div>
      </Card>

      <Card
        title="Activity Forecast — Fase 1"
        subtitle="Holt's linear trend method per jam atas sinyal (cart adds × 2) + chat mentions. 'Titik data' = berapa jam berbeda ada aktivitas tercatat — makin sedikit, makin rendah keandalan tren/forecast-nya. Ini forecast AKTIVITAS, bukan prediksi penjualan."
      >
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Produk</th>
              <th className={thCls}>Sinyal sekarang</th>
              <th className={thCls}>Tren</th>
              <th className={thCls}>Forecast jam depan</th>
              <th className={thCls}>Titik data</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((a) => (
              <tr key={a.id}>
                <td className={tdCls}>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-[11px] text-neutral-400">{a.brand}</div>
                </td>
                <td className={tdCls}>{a.signal_score}</td>
                <td className={tdCls}>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      a.trend === "up" ? "bg-green-50 text-green-700" : a.trend === "down" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {a.trend === "up" ? "↑ naik" : a.trend === "down" ? "↓ turun" : "→ stabil"}
                  </span>
                </td>
                <td className={`${tdCls} font-bold`}>{a.forecastNextHour}</td>
                <td className={tdCls}>
                  <span className={a.dataPoints < 3 ? "text-amber-600" : "text-neutral-600"}>
                    {a.dataPoints} jam{a.dataPoints < 3 ? " (data tipis)" : ""}
                  </span>
                </td>
              </tr>
            ))}
            {analytics.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={5}>
                  Belum ada aktivitas cart/chat yang tercatat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SimulatorSection() {
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
            setMessages((m) => [...m, { role: "bot", text: frame.payload.answer, products: frame.payload.products }]);
          }
          if (frame.type === "error") {
            setMessages((m) => [...m, { role: "bot", text: "Maaf, ada gangguan di server." }]);
          }
        }
      }
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Tidak bisa terhubung ke server." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Chat Simulator</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Memanggil endpoint widget yang sama persis (<code>/api/widget/chat</code>) yang dipakai pengunjung sungguhan — bukan simulasi
          terpisah, jadi apa yang Anda lihat di sini adalah apa yang pelanggan lihat.
        </p>
      </div>
      <div className="mx-auto w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div ref={scrollRef} className="flex h-[480px] flex-col gap-3 overflow-y-auto p-4">
          {messages.length === 0 && <p className="text-center text-sm text-neutral-400">Coba kirim pesan seperti pengunjung toko.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-white" : "bg-neutral-100 text-neutral-800"}`}>
                {m.text}
                {m.products && m.products.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-black/10 pt-2">
                    {m.products.slice(0, 3).map((p, j) => (
                      <div key={j} className="text-xs opacity-80">
                        {p.brand} — {p.name} {p.price != null ? `· Rp ${Number(p.price).toLocaleString("id-ID")}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && <div className="text-xs text-neutral-400">Mengetik…</div>}
        </div>
        <div className="flex gap-2 border-t border-neutral-200 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Tulis pertanyaan seperti pelanggan…"
            className={`${inputCls} flex-1`}
          />
          <button onClick={send} disabled={sending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}

function IntegrationSection() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const snippet = `<script src="${origin}/widget-loader.js" async></script>`;

  function copy() {
    navigator.clipboard?.writeText(snippet).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-neutral-900">Integrasi</h1>
      <Card title="Embed widget ke website toko" subtitle="Satu baris script — tempel sebelum </body> di website toko manapun.">
        <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs text-neutral-100">{snippet}</pre>
        <button onClick={copy} className="mt-3 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
          Salin snippet
        </button>
      </Card>
      <Card title="Preview" subtitle="Widget asli, berjalan di halaman contoh toko.">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <iframe src="/demo-retailer.html" className="h-[520px] w-full" title="Widget preview" />
        </div>
      </Card>
    </div>
  );
}

function AdminShell() {
  const [section, setSection] = useState<Section>("overview");
  return (
    <div className="flex h-full w-full">
      <Sidebar active={section} onSelect={setSection} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
          {section === "overview" && <OverviewSection />}
          {section === "catalog" && <CatalogSection />}
          {section === "marketing" && <MarketingSection />}
          {section === "forecasting" && <ForecastingSection />}
          {section === "simulator" && <SimulatorSection />}
          {section === "integration" && <IntegrationSection />}
        </div>
      </div>
    </div>
  );
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) onSuccess();
    else setError("Password salah.");
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-5 text-xl font-bold text-neutral-900">Admin Dashboard</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password admin"
          className="mb-3 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={submit} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Masuk
        </button>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/products").then((res) => setAuthed(res.status !== 401));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[999999] overflow-hidden bg-neutral-50 text-neutral-900"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {authed === null ? null : authed ? <AdminShell /> : <LoginGate onSuccess={() => setAuthed(true)} />}
    </div>
  );
}
