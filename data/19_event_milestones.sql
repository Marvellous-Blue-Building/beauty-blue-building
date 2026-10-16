-- Phase 2/3 wireframe redesign — milestone checklist (H-56/H-42/H-21/H-7/
-- H-3/H+5/H+21) from "Event, Promo, Uplift & Attribution.md", "Jadwal
-- mundur dari tanggal event". Which milestones are due/overdue is computed
-- client-side from `now` vs `starts_at`; this column only persists which
-- ones a planner has actually checked off.
ALTER TABLE event_calendar ADD COLUMN IF NOT EXISTS milestones_done TEXT[] NOT NULL DEFAULT '{}';
