import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { buildInsightContext } from "@/lib/admin/insight-context";
import { generateInsightReply } from "@/lib/admin/insight-client";
import { getCachedSummary, setCachedSummary } from "@/lib/admin/insight-summary-cache";

const SUMMARY_PROMPT =
  "Berikan satu insight paling penting yang perlu diperhatikan tenant hari ini dari data penjualan, event, dan alert yang ada — singkat (maksimal 3 kalimat), langsung ke poin, tanpa basa-basi pembuka.";

/** Forecasting section's top-of-page insight card — refreshed at most once
 * a day (see insight-summary-cache.ts); pass ?refresh=1 to force it now. */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!forceRefresh) {
    const cached = getCachedSummary();
    if (cached) return NextResponse.json(cached);
  }

  try {
    const dataContext = await buildInsightContext();
    const text = await generateInsightReply(SUMMARY_PROMPT, dataContext);
    const summary = setCachedSummary(text);
    return NextResponse.json(summary);
  } catch (exc) {
    console.error("admin insight summary failed:", exc);
    return NextResponse.json({ error: "insight_unavailable" }, { status: 503 });
  }
}
