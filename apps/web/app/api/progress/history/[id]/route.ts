import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { ScanReportPdf } from "@/lib/email/scan-report-pdf";
import { sendScanReportEmail } from "@/lib/email/send-scan-report";
import { isSmtpConfigured } from "@/lib/email/smtp-client";
import { scanReportFileName } from "@/lib/format";
import type { ScanReport } from "@/types/scan";

interface OwnedScanRow {
  raw_json_data: ScanReport;
  image_data: string | null;
}

/** Ownership is enforced in the WHERE clause, not just by id — a scan row
 * only ever resolves for the user it belongs to. */
async function loadOwnedScan(id: string, userId: string): Promise<OwnedScanRow | null> {
  const result = await pool.query<OwnedScanRow>(
    "SELECT raw_json_data, image_data FROM scan_results WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return result.rows[0] ?? null;
}

async function currentLocale(): Promise<string> {
  return (await cookies()).get("NEXT_LOCALE")?.value ?? "en";
}

/** Serve the scan's diagnostic report as a PDF. Used both for the browser
 * download and, as raw bytes, by the popup's in-page image renderer. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const row = await loadOwnedScan(id, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locale = await currentLocale();
  const pdf = await renderToBuffer(
    ScanReportPdf({ report: row.raw_json_data, locale, imageBase64: row.image_data })
  );
  const filename = scanReportFileName(user.email, row.raw_json_data?.createdAt ?? new Date().toISOString());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Email the same report to the signed-in user's own address. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!isSmtpConfigured()) {
    return NextResponse.json(
      { error: "Email is not available", code: "email_unavailable" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const row = await loadOwnedScan(id, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locale = await currentLocale();
  try {
    await sendScanReportEmail(
      { email: user.email, fullName: user.fullName },
      row.raw_json_data,
      locale,
      row.image_data
    );
  } catch (error) {
    console.error("Failed to email scan report:", error);
    return NextResponse.json({ error: "Email failed", code: "email_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
