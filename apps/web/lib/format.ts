// Real catalog prices (data/beauty_product.csv) are Indonesian Rupiah.
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Null unless the product genuinely has a markdown (listedPrice > price). */
export function discountPercent(price: number, listedPrice: number | null): number | null {
  if (!listedPrice || listedPrice <= price) return null;
  return Math.round((1 - price / listedPrice) * 100);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "dd/MM/yyyy HH:mm:ss" — used in Conversation History's list. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

/** "HH:mm" — shown beside each chat bubble. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "dd/MM/yyyy" — used by dateSeparatorLabel() for anything older than yesterday. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Chat date-group separator (WhatsApp-style): null for today (no badge —
 * "leave as is"), "Yesterday" exactly one day back, otherwise dd/MM/yyyy. */
export function dateSeparatorLabel(iso: string): string | null {
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (dayDiff <= 0) return null;
  if (dayDiff === 1) return "Yesterday";
  return formatDate(iso);
}
