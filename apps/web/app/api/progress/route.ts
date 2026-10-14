import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import type { ProgressSnapshot } from "@/types/progress";

const DAY_THRESHOLDS = [0, 30, 60, 90] as const;

interface ScanRow {
  created_at: string;
  raw_json_data: { hydration?: number; texture?: number; pigmentation?: number };
  image_data: string | null;
}

function metricsFrom(row: ScanRow | undefined): Pick<ProgressSnapshot, "hydration" | "texture" | "pigmentation"> {
  return {
    hydration: row?.raw_json_data.hydration ?? null,
    texture: row?.raw_json_data.texture ?? null,
    pigmentation: row?.raw_json_data.pigmentation ?? null,
  };
}

/**
 * The Day 0 baseline photo is reused for any later day that has no captured
 * photo of its own, so every unlocked card shows a real face.
 */
function imageFrom(row: ScanRow | undefined, baseline: ScanRow | undefined): string | null {
  return row?.image_data ?? baseline?.image_data ?? null;
}

/**
 * Day 0 is the user's real first completed scan_results row (scan+quiz or
 * quiz-only) — always enabled. Day 30/60/90 unlock purely based on real
 * elapsed calendar time since that first row's created_at, independent of
 * whether a check-in actually happened for that day; once unlocked, each
 * shows the most recent scan_results row's metrics (the latest real
 * check-in on file), same as the baseline if nothing newer exists yet.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      DAY_THRESHOLDS.map((day) => ({
        day,
        label: `Day ${day}`,
        enabled: day === 0,
        hydration: null,
        texture: null,
        pigmentation: null,
        image: null,
      }))
    );
  }

  const result = await pool.query<ScanRow>(
    "SELECT created_at, raw_json_data, image_data FROM scan_results WHERE user_id = $1 ORDER BY created_at ASC",
    [user.id]
  );
  const rows = result.rows;
  const baseline = rows[0];
  const latest = rows[rows.length - 1];
  const elapsedDays = baseline
    ? Math.floor((Date.now() - new Date(baseline.created_at).getTime()) / 86_400_000)
    : 0;

  const snapshots: ProgressSnapshot[] = DAY_THRESHOLDS.map((day) => {
    const enabled = day === 0 ? rows.length > 0 : elapsedDays >= day;
    return {
      day,
      label: `Day ${day}`,
      enabled,
      ...(enabled
        ? {
            ...metricsFrom(day === 0 ? baseline : latest),
            image: imageFrom(day === 0 ? baseline : latest, baseline),
          }
        : { hydration: null, texture: null, pigmentation: null, image: null }),
    };
  });

  return NextResponse.json(snapshots);
}
