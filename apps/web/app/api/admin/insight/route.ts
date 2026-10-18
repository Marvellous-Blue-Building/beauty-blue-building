import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { buildInsightContext } from "@/lib/admin/insight-context";
import { generateInsightReply } from "@/lib/admin/insight-client";

/** Vera Intelligence — the admin dashboard's analytics chat. Tenant-only
 * (isAdminRequest), grounded in real event-calendar data plus sample sales
 * numbers (see data/22_demo_sales.sql) rather than a free-form chat. */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    message?: string;
    conversationContext?: string[];
  } | null;

  const text = body?.message?.trim();
  if (!text) return NextResponse.json({ error: "missing_message" }, { status: 400 });

  try {
    const dataContext = await buildInsightContext();
    const reply = await generateInsightReply(text, dataContext, body?.conversationContext ?? []);
    return NextResponse.json({ reply });
  } catch (exc) {
    console.error("admin insight failed:", exc);
    return NextResponse.json({ error: "insight_unavailable" }, { status: 503 });
  }
}
