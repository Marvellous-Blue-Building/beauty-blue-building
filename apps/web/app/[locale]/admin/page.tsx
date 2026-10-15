"use client";

import { useEffect, useState } from "react";

/**
 * Minimal tenant dashboard (Phase 4 + 5) — deliberately not polished:
 * catalog price/stock/category editing, trend-boost CRUD, and the
 * demand-signal analytics table, all real (reading/writing the live DB),
 * none mocked. One page, three tabs, no design-system components —
 * this is an internal merchandising tool, not shopper-facing UI.
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
  cart_adds: number;
  chat_mentions: number;
  signal_score: number;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e4dedd", borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{title}</h2>
      {children}
    </div>
  );
}

function AdminDashboard() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [boosts, setBoosts] = useState<BoostRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newWeight, setNewWeight] = useState(3);

  async function loadProducts(q?: string) {
    const res = await fetch(`/api/admin/products${q ? `?search=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setProducts(data.products ?? []);
  }
  async function loadBoosts() {
    const res = await fetch("/api/admin/tenant-boosts");
    const data = await res.json();
    setBoosts(data.boosts ?? []);
  }
  async function loadAnalytics() {
    const res = await fetch("/api/admin/analytics");
    const data = await res.json();
    setAnalytics(data.products ?? []);
  }

  useEffect(() => {
    loadProducts();
    loadBoosts();
    loadAnalytics();
  }, []);

  async function updateProduct(id: string, patch: Partial<{ price: number; stockQuantity: number; category: string }>) {
    await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

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

  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, textTransform: "uppercase", opacity: 0.6, padding: "6px 8px", borderBottom: "1px solid #e4dedd" };
  const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #f0ebe9", fontSize: 13 };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px 80px", fontFamily: "-apple-system, sans-serif", color: "#241F26" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Dashboard Tenant</h1>
      <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 24 }}>
        Katalog, trend boost, dan demand signal — semua baca/tulis langsung ke database, tidak ada data mock.
      </p>

      <Section title="Trend / Merchandising Boost">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="mis. glass skin, bold red lip"
            style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
          />
          <select value={newWeight} onChange={(e) => setNewWeight(Number(e.target.value))} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                Bobot {w}
              </option>
            ))}
          </select>
          <button onClick={addBoost} style={{ background: "#7A4259", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Tambah
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Keyword</th>
              <th style={th}>Bobot</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {boosts.map((b) => (
              <tr key={b.id}>
                <td style={td}>{b.keyword}</td>
                <td style={td}>{b.weight}</td>
                <td style={td}>
                  <button onClick={() => toggleBoost(b.id, !b.active)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "1px solid #ddd", background: b.active ? "#E8F3E9" : "#fff", color: b.active ? "#2E6B3A" : "#888", cursor: "pointer" }}>
                    {b.active ? "Aktif" : "Nonaktif"}
                  </button>
                </td>
                <td style={td}>
                  <button onClick={() => deleteBoost(b.id)} style={{ fontSize: 11, color: "#A33", border: "none", background: "none", cursor: "pointer" }}>
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {boosts.length === 0 && (
              <tr>
                <td style={td} colSpan={4}>
                  Belum ada boost aktif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Katalog Produk">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadProducts(search)}
            placeholder="Cari nama / brand / SKU…"
            style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
          />
          <button onClick={() => loadProducts(search)} style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
            Cari
          </button>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Produk</th>
                <th style={th}>Harga</th>
                <th style={th}>Stok</th>
                <th style={th}>Kategori</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ opacity: 0.6, fontSize: 11 }}>{p.brand}</div>
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      defaultValue={Math.round(Number(p.price))}
                      onBlur={(e) => updateProduct(p.id, { price: Number(e.target.value) })}
                      style={{ width: 90, border: "1px solid #ddd", borderRadius: 6, padding: "3px 6px", fontSize: 12 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      defaultValue={p.stock_quantity}
                      onBlur={(e) => updateProduct(p.id, { stockQuantity: Number(e.target.value) })}
                      style={{ width: 70, border: "1px solid #ddd", borderRadius: 6, padding: "3px 6px", fontSize: 12 }}
                    />
                  </td>
                  <td style={td}>{p.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Demand Signal (bukan forecasting penjualan)">
        <p style={{ fontSize: 11.5, opacity: 0.6, marginBottom: 10 }}>
          Skor = (jumlah ditambahkan ke keranjang × 2) + jumlah kali direkomendasikan di chat. Belum ada tabel
          order/transaksi di project ini, jadi ini sinyal minat, bukan prediksi penjualan sungguhan.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Produk</th>
              <th style={th}>Cart adds</th>
              <th style={th}>Chat mentions</th>
              <th style={th}>Skor</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((a) => (
              <tr key={a.id}>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div style={{ opacity: 0.6, fontSize: 11 }}>{a.brand}</div>
                </td>
                <td style={td}>{a.cart_adds}</td>
                <td style={td}>{a.chat_mentions}</td>
                <td style={{ ...td, fontWeight: 700 }}>{a.signal_score}</td>
              </tr>
            ))}
            {analytics.length === 0 && (
              <tr>
                <td style={td} colSpan={4}>
                  Belum ada aktivitas cart/chat yang tercatat untuk produk apa pun.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
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
    <div style={{ maxWidth: 360, margin: "120px auto", fontFamily: "-apple-system, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Admin Dashboard</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Password admin"
        style={{ width: "100%", border: "1px solid #ddd", borderRadius: 8, padding: "10px 14px", fontSize: 14, marginBottom: 10 }}
      />
      <button onClick={submit} style={{ width: "100%", background: "#7A4259", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
        Masuk
      </button>
      {error && <p style={{ color: "#A33", fontSize: 12, marginTop: 10 }}>{error}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/products").then((res) => setAuthed(res.status !== 401));
  }, []);

  if (authed === null) return null;
  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;
  return <AdminDashboard />;
}
