import { pool } from "@/lib/db";

/** Event/promo calendar CRUD — Phase 2 Modul 1 (see "Event, Promo, Uplift &
 * Attribution.md"). Mirrors the exact read/list shape of lib/tenant-boosts.ts. */

export interface EventRow {
  id: string;
  name: string;
  type: string;
  subType: string | null;
  startsAt: string;
  endsAt: string;
  categoryFocus: string | null;
  discountPct: number | null;
  adBudget: number | null;
  promoCode: string | null;
  status: "rencana" | "disetujui" | "berjalan" | "selesai" | "batal";
  notes: string | null;
  createdAt: string;
  /** Which of the H-56/H-42/H-21/H-7/H-3/H+5/H+21 milestones a planner has
   * checked off — see data/19_event_milestones.sql. Which ones are
   * due/overdue is computed client-side from `now` vs `startsAt`. */
  milestonesDone: string[];
}

function mapRow(r: {
  id: string;
  name: string;
  type: string;
  sub_type: string | null;
  starts_at: string;
  ends_at: string;
  category_focus: string | null;
  discount_pct: string | null;
  ad_budget: string | null;
  promo_code: string | null;
  status: EventRow["status"];
  notes: string | null;
  created_at: string;
  milestones_done: string[] | null;
}): EventRow {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    subType: r.sub_type,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    categoryFocus: r.category_focus,
    discountPct: r.discount_pct === null ? null : Number(r.discount_pct),
    adBudget: r.ad_budget === null ? null : Number(r.ad_budget),
    promoCode: r.promo_code,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    milestonesDone: r.milestones_done ?? [],
  };
}

export async function listEvents(): Promise<EventRow[]> {
  const { rows } = await pool.query(
    `SELECT id, name, type, sub_type, starts_at, ends_at, category_focus,
            discount_pct, ad_budget, promo_code, status, notes, created_at, milestones_done
     FROM event_calendar ORDER BY starts_at DESC`
  );
  return rows.map(mapRow);
}

export interface CreateEventInput {
  name: string;
  type: string;
  subType?: string | null;
  startsAt: string;
  endsAt: string;
  categoryFocus?: string | null;
  discountPct?: number | null;
  adBudget?: number | null;
  promoCode?: string | null;
  status?: EventRow["status"];
  notes?: string | null;
}

export async function createEvent(input: CreateEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO event_calendar
       (name, type, sub_type, starts_at, ends_at, category_focus, discount_pct, ad_budget, promo_code, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.name,
      input.type,
      input.subType || null,
      input.startsAt,
      input.endsAt,
      input.categoryFocus || null,
      input.discountPct ?? null,
      input.adBudget ?? null,
      input.promoCode || null,
      input.status ?? "rencana",
      input.notes || null,
    ]
  );
}

export async function updateEvent(id: string, patch: { status?: EventRow["status"]; milestonesDone?: string[] }): Promise<void> {
  if (patch.status) {
    await pool.query(`UPDATE event_calendar SET status = $2, updated_at = now() WHERE id = $1`, [id, patch.status]);
  }
  if (patch.milestonesDone) {
    await pool.query(`UPDATE event_calendar SET milestones_done = $2, updated_at = now() WHERE id = $1`, [id, patch.milestonesDone]);
  }
}

export async function deleteEvent(id: string): Promise<void> {
  await pool.query(`DELETE FROM event_calendar WHERE id = $1`, [id]);
}
