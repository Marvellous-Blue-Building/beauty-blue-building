import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { ProgressHistoryItem } from "@/types/progress";

/**
 * "Your Progress History" list — every persisted scan_results row for the
 * signed-in user, newest first. Only the id + timestamp + bare overall score
 * are needed for the list; the actual report is rendered on demand by
 * app/api/progress/history/[id]/route.ts (download) so this stays a cheap
 * query regardless of how many scans / how large the images are.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const result = await pool.query<{ id: string; created_at: string; overall: string | null }>(
    "SELECT id, created_at, raw_json_data->>'overall' AS overall FROM scan_results WHERE user_id = $1 ORDER BY created_at DESC",
    [user.id]
  );

  const items: ProgressHistoryItem[] = result.rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    overall: row.overall === null ? null : Number(row.overall),
  }));
  return NextResponse.json(items);
}
