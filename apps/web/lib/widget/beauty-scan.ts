/**
 * Widget beauty scan — keeps each result against the guest widget session
 * (data/20_widget_beauty_scans.sql) and turns the latest one into grounding
 * for the widget chat. The scan itself is lib/beauty-scan.ts.
 */
import { pool } from "@/lib/db";
import type { BeautyScanReport } from "@/types/beauty-scan";
import type { ScanMetrics } from "@/types/scan";

// ---------------------------------------------------------------- persistence

export interface SavedBeautyScan {
  id: string;
  report: BeautyScanReport;
}

/** A scan already saved under this widget request id (a retried upload). */
export async function findWidgetBeautyScan(sessionId: string, requestId: string): Promise<SavedBeautyScan | null> {
  const { rows } = await pool.query<SavedBeautyScan>(
    `SELECT id, report FROM widget_beauty_scans WHERE session_id = $1 AND request_id = $2`,
    [sessionId, requestId]
  );
  return rows[0] ?? null;
}

/** Saves the scan; when the same request id raced in first, that row wins
 * and is returned, so both uploads show the same result. */
export async function saveWidgetBeautyScan(sessionId: string, requestId: string, report: BeautyScanReport): Promise<SavedBeautyScan> {
  const shadeProductIds = (report.catalogShades ?? []).flatMap((g) => g.matches.map((m) => m.productId));
  const { rows } = await pool.query<SavedBeautyScan>(
    `INSERT INTO widget_beauty_scans
       (session_id, request_id, report, season_key, season_confidence, undertone,
        face_shape_key, skin_type_key, skin_overall, shade_product_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (session_id, request_id) DO UPDATE SET request_id = EXCLUDED.request_id
     RETURNING id, report`,
    [
      sessionId,
      requestId,
      JSON.stringify(report),
      report.colour.season?.key ?? null,
      report.colour.season?.confidence ?? null,
      report.colour.season ? report.colour.undertone ?? null : null,
      report.faceShape.shape?.key ?? null,
      report.skin.analysis.key ?? null,
      report.skinMetrics.overall ?? null,
      shadeProductIds.length > 0 ? shadeProductIds : null,
    ]
  );
  return rows[0];
}

/** The session's most recent beauty scan, if it has one. Older rows saved
 * before this schema (no `colour` key) are skipped. */
export async function getLatestWidgetBeautyScan(sessionId: string): Promise<BeautyScanReport | null> {
  const { rows } = await pool.query<{ report: BeautyScanReport }>(
    `SELECT report FROM widget_beauty_scans
     WHERE session_id = $1 AND report ? 'colour'
     ORDER BY created_at DESC LIMIT 1`,
    [sessionId]
  );
  return rows[0]?.report ?? null;
}

// ---------------------------------------------------------------- chat grounding

const UNDERTONE_ID: Record<string, string> = { warm: "hangat", cool: "dingin", neutral: "netral" };

/** Mirrors services/matching-service's scan_metric_keywords (threshold 70)
 * plus the skin type, so a widget visitor's scan nudges ranking the same way
 * a signed-in user's scan does. Ranking only — never an admission gate. */
const SKIN_TYPE_KEYWORDS: Record<string, string[]> = {
  kering: ["hyaluronic acid", "glycerin", "ceramide", "squalane"],
  berminyak: ["niacinamide", "salicylic acid", "clay"],
  sensitif: ["centella", "panthenol", "allantoin"],
  kombinasi: ["niacinamide", "hyaluronic acid"],
  normal: [],
};
const METRIC_KEYWORDS: [keyof ScanMetrics, string[]][] = [
  ["hydration", ["hyaluronic acid", "glycerin", "ceramide", "squalane"]],
  ["elasticity", ["peptide", "retinol", "collagen"]],
  ["pigmentation", ["vitamin c", "niacinamide", "alpha arbutin"]],
  ["texture", ["salicylic acid", "niacinamide"]],
  ["pores", ["niacinamide", "salicylic acid", "clay"]],
];
const METRIC_BOOST_THRESHOLD = 70;

export function beautyScanBoostKeywords(report: BeautyScanReport): string[] {
  const keywords = [...(SKIN_TYPE_KEYWORDS[report.skin.analysis.key] ?? [])];
  for (const [metric, words] of METRIC_KEYWORDS) {
    if ((report.skinMetrics[metric] ?? 100) < METRIC_BOOST_THRESHOLD) keywords.push(...words);
  }
  return [...new Set(keywords)];
}

/** One Indonesian line for the chat's grounding context (read by the
 * ai-advisor step as `context: ...`). */
export function beautyScanGuidance(report: BeautyScanReport): string {
  const parts: string[] = [];
  const season = report.colour.season;
  if (season) {
    const undertone = UNDERTONE_ID[report.colour.undertone ?? "neutral"];
    parts.push(`musim warna ${season.displayName} (undertone ${undertone}, keyakinan ${season.confidencePercent}%)`);
  }
  if (report.faceShape.shape) parts.push(`bentuk wajah ${report.faceShape.shape.displayName}`);
  parts.push(`tipe kulit ${report.skin.analysis.summary.replace(/^Kulit\s+/i, "").toLowerCase()} (perkiraan)`);
  const lips = report.colour.palette?.categories.find((c) => c.id === "lip");
  if (season && lips) parts.push(`warna lipstik yang cocok: ${lips.swatches.slice(0, 3).map((s) => s.name).join(", ")}`);
  return `hasil pindai wajah pengunjung: ${parts.join("; ")}`;
}

// ---------------------------------------------------------------- direct answers

export type WidgetLanguage = "id" | "en";

const UNDERTONE_EN: Record<string, string> = { warm: "warm", cool: "cool", neutral: "neutral" };

// Question detection is bilingual in both languages — only the reply follows `language`.
const SHADE_QUESTION = /cocok|sesuai|\bpas\b|shade|warna|rekomendasi|saran|bagus|suit|match|go with|recommend|best|right for|colou?r/i;
const SHADE_WORDS: [string, RegExp][] = [
  ["lip", /lipstik|lipstick|lip ?tint|lip ?cream|lip ?matte|\blip\b|bibir/i],
  ["blush", /blush|perona pipi/i],
  ["eyeshadow", /eye ?shadow|perona mata/i],
  ["eyeliner", /eye ?liner/i],
  ["brow", /\balis\b|brow/i],
  ["highlighter", /highlight/i],
  ["base", /foundation|cushion|bb cream|cc cream|concealer|alas bedak/i],
];
const SKIN_PRODUCT_WORDS = /produk|serum|toner|pelembab|moisturi[sz]er|sunscreen|cleanser|sabun|krim|cream|essence|masker|\bmask\b|product/i;

export interface BeautyScanAnswer {
  text: string;
  /** Catalog product ids to show under the reply, closest first. */
  productIds: string[];
}

/** Answers questions the scan itself can answer — "lipstik yang cocok
 * untukku?" / "which lipstick suits me?", "bentuk wajahku apa?", "what's my
 * skin type?" — from the saved result, without a guess from the general
 * pipeline. Null for anything else, which goes through the normal chat
 * pipeline with the scan as grounding. Replies in `language` (the widget's
 * page language); the report's own names are already in the language the
 * scan ran in. */
export function answerFromBeautyScan(userText: string, report: BeautyScanReport, language: WidgetLanguage = "id"): BeautyScanAnswer | null {
  const en = language === "en";
  const text = userText.toLowerCase();
  const season = report.colour.season;
  const undertoneWord = (en ? UNDERTONE_EN : UNDERTONE_ID)[report.colour.undertone ?? "neutral"];

  const shadeKind = SHADE_WORDS.find(([, pattern]) => pattern.test(text))?.[0];
  if (shadeKind && SHADE_QUESTION.test(text)) {
    const group = report.catalogShades?.find((g) => g.id === shadeKind);
    if (shadeKind === "base") {
      const skin = report.colour.evidence?.skin;
      if (!group || !skin) return null;
      return group.matches.length
        ? {
            text: en
              ? "From your scan, these are the foundations and cushions in the catalog closest to your skin tone. Swatch on your jawline first — camera and lighting can shift colour."
              : `Dari scan-mu, ini foundation dan cushion di katalog yang warnanya paling dekat dengan warna kulitmu. Tetap coba swatch di rahang dulu ya, karena kamera dan cahaya bisa menggeser warna.`,
            productIds: group.matches.map((m) => m.productId),
          }
        : {
            text: en
              ? "From your scan, there's no foundation shade in the catalog close enough to your skin tone yet."
              : "Dari scan-mu, belum ada shade foundation di katalog yang cukup dekat dengan warna kulitmu.",
            productIds: [],
          };
    }
    if (!season) return null;
    const swatches = report.colour.palette?.categories.find((c) => c.id === shadeKind)?.swatches ?? [];
    const label = report.colour.palette?.categories.find((c) => c.id === shadeKind)?.label ?? shadeKind;
    const names = swatches.slice(0, 3).map((s) => s.name).join(", ");
    const lead = en
      ? `You're a ${season.displayName}${names ? `, so ${label.toLowerCase()} in ${names} blends best with your colouring` : ""}.`
      : `Kamu ${season.displayName}${names ? `, jadi ${label.toLowerCase()} dengan nuansa ${names} paling menyatu dengan warnamu` : ""}.`;
    if (group && group.matches.length) {
      return { text: `${lead} ${en ? "These are the closest shades in the catalog:" : "Ini shade dari katalog yang paling dekat:"}`, productIds: group.matches.map((m) => m.productId) };
    }
    return {
      text: `${lead} ${en ? "Unfortunately there's no catalog shade close enough to that palette yet." : "Sayangnya belum ada shade di katalog yang cukup dekat dengan palet itu."}`,
      productIds: [],
    };
  }

  if (/bentuk wajah|face shape/.test(text) && !SKIN_PRODUCT_WORDS.test(text)) {
    const shape = report.faceShape.shape;
    if (!shape) return null;
    const best = (report.faceShape.looks?.ranked ?? []).filter((l) => l.tier === "best").map((l) => l.displayName);
    const also = shape.alsoFits ? (en ? ` It's also close to ${shape.alsoFits.displayName}.` : ` Wajahmu juga mendekati ${shape.alsoFits.displayName}.`) : "";
    const looks = best.length
      ? en ? ` Looks that need the least adjusting: ${best.join(" and ")}.` : ` Look yang paling sedikit perlu penyesuaian: ${best.join(" dan ")}.`
      : "";
    const lead = en ? `From your scan, your face shape is ${shape.displayName}.` : `Dari scan-mu, bentuk wajahmu ${shape.displayName}.`;
    return { text: `${lead} ${report.faceShape.description ?? ""}${also}${looks}`.replace(/\s+/g, " ").trim(), productIds: [] };
  }

  const askedSkinType = /(tipe|jenis) kulit/.test(text) ? /\b(apa|gimana|bagaimana|termasuk)\b/.test(text) : /skin type/.test(text) && /\b(what|which|my)\b/.test(text);
  if (askedSkinType && !SKIN_PRODUCT_WORDS.test(text)) {
    const summary = report.skin.analysis.summary.toLowerCase();
    return {
      text: en
        ? `From your scan, your skin reads as ${summary}. That's an estimate from ${
            report.captureMode === "three-pose" ? "3 photos (front, right, left)" : "your photo"
          }, not a diagnosis. Want me to find skincare that suits it?`
        : `Dari scan-mu, kulitmu terbaca ${summary}. Ini perkiraan dari ${
            report.captureMode === "three-pose" ? "3 foto (depan, kanan, kiri)" : "foto wajahmu"
          }, bukan diagnosis. Mau aku carikan skincare yang cocok untuk itu?`,
      productIds: [],
    };
  }

  if (/(musim|season|palet) warna|warna apa yang cocok|undertone|colou?r season|my season|palette|what colou?rs? suit/.test(text) && season) {
    const runner = season.conclusive || !season.runnerUp
      ? ""
      : en ? ` It's also close to ${season.runnerUp.displayName}.` : ` Hasilnya juga dekat dengan ${season.runnerUp.displayName}.`;
    return {
      text: en
        ? `From your scan, you're a ${season.displayName} with a ${undertoneWord} undertone (${season.confidencePercent}% confidence).${runner}`
        : `Dari scan-mu, kamu ${season.displayName} dengan undertone ${undertoneWord} (keyakinan ${season.confidencePercent}%).${runner}`,
      productIds: [],
    };
  }

  return null;
}
