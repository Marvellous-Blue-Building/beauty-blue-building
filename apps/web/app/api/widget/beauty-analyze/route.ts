import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SkinScanError } from "@/lib/skin-scan-client";
import { callBeautyScanService, matchCatalogShades, readBeautyScanInput } from "@/lib/beauty-scan";
import { touchWidgetSession } from "@/lib/widget/session";
import { findWidgetBeautyScan, saveWidgetBeautyScan } from "@/lib/widget/beauty-scan";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/widget/beauty-analyze — the widget's beauty scan. One scan in
 * three poses (a front burst, then turned right and turned left) goes to
 * services/skin-scanning `/analyze-beauty`, which reads the colour season,
 * face shape and skin type together. The season's palette is matched to real
 * catalog shades, and the whole result is saved against the guest session so
 * the widget chat can use it (see lib/widget/bot-reply.ts).
 *
 * Body: `{sessionId, requestId?, frames, right?, left?}` — base64 JPEG data
 * URLs, not mirrored; the side photos are optional. `requestId` (a UUID the
 * widget makes per scan) makes a retried upload return the saved result
 * instead of analysing and saving it again.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { sessionId?: unknown; requestId?: unknown } | null;
  const input = readBeautyScanInput(body);
  if (typeof body?.sessionId !== "string" || !UUID.test(body.sessionId) || input === null) {
    return NextResponse.json({ error: "missing_frames_or_session" }, { status: 400 });
  }
  if (input === "too_large") {
    return NextResponse.json({ error: "frames_too_large" }, { status: 413 });
  }
  const sessionId = body.sessionId;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : randomUUID();

  try {
    if (!(await touchWidgetSession(sessionId))) {
      return NextResponse.json({ error: "invalid_session" }, { status: 404 });
    }
    const prior = await findWidgetBeautyScan(sessionId, requestId);
    if (prior) return NextResponse.json({ id: prior.id, ...prior.report });

    // The widget and its chat speak Indonesian.
    const report = await callBeautyScanService({ ...input, language: "id" }, req.nextUrl.origin);
    // Shades are a bonus on top of the scan — the scan still saves without them.
    report.catalogShades = await matchCatalogShades(report).catch(() => []);
    const saved = await saveWidgetBeautyScan(sessionId, requestId, report);
    return NextResponse.json({ id: saved.id, ...saved.report });
  } catch (err) {
    if (err instanceof SkinScanError) {
      return NextResponse.json({ error: err.code ?? "scan_failed", message: err.message }, { status: err.status });
    }
    console.error("Widget beauty scan failed", err);
    return NextResponse.json({ error: "scan_failed" }, { status: 500 });
  }
}
