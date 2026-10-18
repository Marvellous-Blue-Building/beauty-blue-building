import { NextResponse } from "next/server";

/** GET /api/widget/config — unauthenticated, read-only, hard-whitelisted.
 * Single-tenant: one static config per deployment (no organization_id
 * lookup) — set via env vars so a retailer can retheme without a redeploy
 * of app code, just their own env file. Mirrors Ganes' PublicWidgetConfig
 * contract: only display/branding fields ever serialize here, nothing
 * internal (no prompt tuning, no admin settings). */
export async function GET() {
  return NextResponse.json({
    botName: process.env.WIDGET_BOT_NAME ?? "Blue-B",
    greeting: process.env.WIDGET_GREETING ?? "Hai! Aku Blue-B, AI Beauty Advisor. Ceritain kondisi kulitmu atau produk apa yang kamu cari ya.",
    color: process.env.WIDGET_COLOR ?? "#7A4259",
    position: process.env.WIDGET_POSITION ?? "br",
    termsUrl: process.env.WIDGET_TERMS_URL ?? null,
    privacyUrl: process.env.WIDGET_PRIVACY_URL ?? null,
  });
}
