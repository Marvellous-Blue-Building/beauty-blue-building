import { pool } from "@/lib/db";
import { LandingPage } from "@/components/landing/LandingPage";

/** Live catalog size for the facts strip; the tile is hidden if the DB is unreachable. */
async function getProductCount(): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM products");
    return rows[0]?.n ?? null;
  } catch {
    return null;
  }
}

export default async function RootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LandingPage locale={locale} productCount={await getProductCount()} />;
}
