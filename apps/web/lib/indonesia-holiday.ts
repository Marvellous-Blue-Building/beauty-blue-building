import { pool } from "@/lib/db";

/**
 * Indonesia's national holiday calendar — fetched fresh on every
 * register/login/relogin (see app/api/auth/google/callback/route.ts, the
 * single path all three funnel through) and upserted into
 * `indonesia_holiday`. The first fetch for a given year inserts; every
 * later fetch (a relogin, or the API's own data correction) updates the
 * same rows by their (holiday_date, name) key instead of duplicating.
 * Consumed by services/geotagging-weather's formula to decide whether
 * today is a holiday.
 */

interface KemendesaHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
  is_civic: boolean;
  is_religious: boolean;
  is_cuti_bersama: boolean;
}

interface KemendesaResponse {
  data: KemendesaHoliday[];
}

export async function ensureIndonesiaHolidaysForYear(year: number): Promise<void> {
  try {
    const response = await fetch(`https://api.kemendesa.link/libur-nasional/api/holidays/${year}.json`);
    if (!response.ok) {
      console.error(`Indonesia holiday API returned ${response.status} for year ${year}`);
      return;
    }
    const body = (await response.json()) as KemendesaResponse;
    const holidays = Array.isArray(body.data) ? body.data : [];

    for (const holiday of holidays) {
      await pool.query(
        `INSERT INTO indonesia_holiday (holiday_date, name, is_civic, is_religious, is_cuti_bersama, year)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (holiday_date, name) DO UPDATE SET
           is_civic = EXCLUDED.is_civic,
           is_religious = EXCLUDED.is_religious,
           is_cuti_bersama = EXCLUDED.is_cuti_bersama,
           year = EXCLUDED.year,
           updated_at = CURRENT_TIMESTAMP`,
        [holiday.date, holiday.name, holiday.is_civic, holiday.is_religious, holiday.is_cuti_bersama, year]
      );
    }
  } catch (error) {
    // Best-effort — a holiday-calendar refresh failing must never block a
    // real login.
    console.error("Failed to refresh Indonesia holiday calendar:", error);
  }
}
