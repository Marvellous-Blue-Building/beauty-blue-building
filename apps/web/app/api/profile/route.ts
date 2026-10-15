import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { containsFlaggedIngredient } from "@/lib/rag/sensitivity-flags";
import { withCacheBust } from "@/lib/avatar-url";
import { isSmtpConfigured } from "@/lib/email/smtp-client";
import { getMostRecentLocation } from "@/lib/location-cache";
import type { UserProfile } from "@/types/user";
import type { QuizAnswers } from "@/types/quiz";

interface UserRow {
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  preferences: UserProfile["preferences"];
  send_report_email: boolean;
  realtime_location_enabled: boolean;
  last_address: string | null;
  updated_at: string;
}

async function loadProfile(userId: string): Promise<UserProfile> {
  const userResult = await pool.query<UserRow>(
    `SELECT full_name, email, avatar_url, preferences, send_report_email,
            realtime_location_enabled, last_address, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];

  // Day streak = how many completed scan+questionnaire check-ins this user
  // has on file, not a separately tracked counter.
  const streakResult = await pool.query<{ count: string }>(
    "SELECT count(*) FROM scan_results WHERE user_id = $1",
    [userId]
  );
  const dayStreak = parseInt(streakResult.rows[0].count, 10);

  const questionnaireResult = await pool.query<{ responses: QuizAnswers }>(
    "SELECT responses FROM questionnaires WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  const latestQuiz = questionnaireResult.rows[0]?.responses ?? null;

  // The latest row with a real scan score — not just the latest row overall,
  // since a quiz-only (no camera scan) submission has no "overall" value and
  // shouldn't blank out a real score the user obtained earlier.
  const scanResult = await pool.query<{ overall: string }>(
    `SELECT raw_json_data->>'overall' AS overall FROM scan_results
     WHERE user_id = $1 AND raw_json_data ? 'overall'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const scanScore = scanResult.rows[0]?.overall ? Math.round(parseFloat(scanResult.rows[0].overall)) : null;

  // Real computation: how many of the user's cart/saved products contain an
  // ingredient matching one of their declared sensitivities.
  const productIdsResult = await pool.query<{ product_id: string }>(
    `SELECT product_id FROM cart_items WHERE user_id = $1
     UNION
     SELECT product_id FROM saved_products WHERE user_id = $1`,
    [userId]
  );
  let flaggedAllergenCount = 0;
  if (latestQuiz && productIdsResult.rows.length > 0) {
    const ids = productIdsResult.rows.map((r) => r.product_id);
    const ingredientsResult = await pool.query<{ ingredients: string | null }>(
      "SELECT ingredients FROM products WHERE id = ANY($1)",
      [ids]
    );
    flaggedAllergenCount = ingredientsResult.rows.filter((r) =>
      containsFlaggedIngredient(r.ingredients, latestQuiz.sensitivities)
    ).length;
  }

  // Redis still has up to the last 5 pings (every 5 minutes); Postgres
  // only gets flushed once an hour (see app/api/profile/location/route.ts),
  // so prefer Redis's freshest entry for display and fall back to the DB
  // snapshot once Redis's entries have aged out.
  const recentLocation = await getMostRecentLocation(userId);
  const address = recentLocation?.address ?? user.last_address;

  return {
    name: user.full_name ?? user.email,
    email: user.email,
    avatarUrl: withCacheBust(user.avatar_url, new Date(user.updated_at).getTime()),
    skinType: latestQuiz?.skinType ?? null,
    concernSummary: latestQuiz?.concerns[0] ?? null,
    goal: latestQuiz?.goal ?? null,
    scanScore,
    dayStreak,
    flaggedAllergenCount,
    preferences: user.preferences,
    sendReportEmail: user.send_report_email,
    smtpConfigured: isSmtpConfigured(),
    realtimeLocationEnabled: user.realtime_location_enabled,
    address,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json(await loadProfile(user.id));
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const updates = (await request.json()) as {
    preferences?: UserProfile["preferences"];
    sendReportEmail?: boolean;
    realtimeLocationEnabled?: boolean;
    fullName?: string;
  };

  // Never trust a client-side disabled toggle alone — reject turning this
  // on server-side too when SMTP genuinely isn't usable right now.
  if (updates.sendReportEmail === true && !isSmtpConfigured()) {
    return NextResponse.json(
      { error: "Email reports aren't available right now — SMTP isn't configured." },
      { status: 400 }
    );
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.preferences !== undefined) {
    params.push(JSON.stringify(updates.preferences));
    setClauses.push(`preferences = $${params.length}::jsonb`);
  }
  if (updates.sendReportEmail !== undefined) {
    params.push(updates.sendReportEmail);
    setClauses.push(`send_report_email = $${params.length}`);
  }
  if (updates.realtimeLocationEnabled !== undefined) {
    params.push(updates.realtimeLocationEnabled);
    setClauses.push(`realtime_location_enabled = $${params.length}`);
  }
  if (updates.fullName !== undefined) {
    params.push(updates.fullName);
    setClauses.push(`full_name = $${params.length}`);
  }

  if (setClauses.length > 0) {
    params.push(user.id);
    await pool.query(
      `UPDATE users SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length}`,
      params
    );
  }

  return NextResponse.json(await loadProfile(user.id));
}
