import { NextResponse } from "next/server";
import { serverStore } from "@/lib/server-store";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { ScanReport } from "@/types/scan";

export async function GET() {
  const user = await getSessionUser();
  if (user) {
    const result = await pool.query<{ raw_json_data: ScanReport }>(
      "SELECT raw_json_data FROM scan_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    if (result.rows[0]) {
      return NextResponse.json(result.rows[0].raw_json_data);
    }
  }
  // Guest / no persisted scan yet — process-wide last-seen real report.
  return NextResponse.json(serverStore.latestScanResult);
}
