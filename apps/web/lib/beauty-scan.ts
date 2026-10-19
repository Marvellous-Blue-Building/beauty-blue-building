/**
 * Beauty scan, server side — calls services/skin-scanning `/analyze-beauty`
 * (one scan in three poses: colour season, face shape and skin type) and
 * turns the season's palette into real catalog shades. Used by the /scan flow (app/api/scan-beauty) and the embeddable
 * widget (app/api/widget/beauty-analyze).
 */
import { lookImagePath } from "@/lib/scan/look-image";
import { pool } from "@/lib/db";
import { deltaE76, hexToLab, type Lab } from "@/lib/color/delta-e";
import { extractImageUrl } from "@/lib/rag/image-url";
import { SkinScanError } from "@/lib/skin-scan-client";
import type { BeautyScanReport, BeautySwatch, ShadeGroup, ShadeMatch } from "@/types/beauty-scan";

const SKIN_SCAN_SERVICE_URL = process.env.SKIN_SCAN_SERVICE_URL ?? "http://localhost:3003";
// Three models over up to 12 + 8 frames on CPU — a couple of seconds normally.
const SERVICE_TIMEOUT_MS = 60_000;

export const MAX_BEAUTY_FRAMES = 12;
export const MAX_SIDE_FRAMES = 4;
// Under the 10MB the proxy buffers (proxyClientMaxBodySize); a front burst
// plus two side photos at ≤960px is about 2-4MB.
export const MAX_BEAUTY_UPLOAD_CHARS = 9_000_000;

export interface BeautyScanInput {
  /** Front burst — base64 JPEG data URLs, not mirrored. */
  frames: string[];
  /** Turned to the user's own right (shows their left cheek). */
  right?: string[];
  /** Turned to the user's own left (shows their right cheek). */
  left?: string[];
  language?: "id" | "en";
}

function isFrameList(value: unknown, min: number, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((f) => typeof f === "string" && f.length > 0)
  );
}

/** Validates a client's `{frames, right?, left?}`; null when malformed.
 * Throws nothing — the routes answer 400 / 413 themselves. */
export function readBeautyScanInput(body: unknown): BeautyScanInput | "too_large" | null {
  const b = body as { frames?: unknown; right?: unknown; left?: unknown } | null;
  if (!b || !isFrameList(b.frames, 1, MAX_BEAUTY_FRAMES)) return null;
  const right = b.right ?? [];
  const left = b.left ?? [];
  if (!isFrameList(right, 0, MAX_SIDE_FRAMES) || !isFrameList(left, 0, MAX_SIDE_FRAMES)) return null;
  const size = [...b.frames, ...right, ...left].reduce((n, f) => n + f.length, 0);
  if (size > MAX_BEAUTY_UPLOAD_CHARS) return "too_large";
  return { frames: b.frames, right, left };
}

/** Sends the scan's photos to services/skin-scanning. A 422 carries the
 * reason in `code` (no_face, face_too_small, no_skin, too_dark, too_blurry).
 * Look previews remain web-app-relative so reverse proxies cannot leak internal origins. */
export async function callBeautyScanService(input: BeautyScanInput): Promise<BeautyScanReport> {
  let res: Response;
  try {
    res = await fetch(`${SKIN_SCAN_SERVICE_URL}/analyze-beauty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frames: input.frames,
        right: input.right ?? [],
        left: input.left ?? [],
        language: input.language ?? "id",
      }),
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
  } catch {
    throw new SkinScanError("Couldn't reach the skin-scanning service. Is it running on port 3003?", 503, "service_unreachable");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string | { code?: string; message?: string } } | null;
    const detail = body?.detail;
    if (detail && typeof detail === "object") {
      throw new SkinScanError(detail.message ?? "Beauty scan failed.", res.status, detail.code);
    }
    throw new SkinScanError(typeof detail === "string" ? detail : "Beauty scan failed.", res.status);
  }
  const report = (await res.json()) as BeautyScanReport;
  // Preserve local asset paths; clients resolve them against the web app host.
  for (const look of report.faceShape.looks?.ranked ?? []) {
    look.imageUrl = lookImagePath(look.imageUrl) ?? "";
  }
  return report;
}

// ---------------------------------------------------------------- catalog shades

interface ShadeRow {
  id: string;
  name: string;
  brand: string | null;
  price: string;
  image_url: string | null;
  category: string | null;
  parent_sku: string | null;
  color_variant: string;
  variant_color_name: string | null;
  size_label: string | null;
}

/** Which catalog rows can stand for each palette category. The catalog
 * categories are broad ("makeup" holds lipsticks and blushes alike), so the
 * product name decides within them. `base` is foundation-type makeup, matched
 * to the measured skin colour instead of a palette. */
const SHADE_KINDS: Record<string, { categories: string[]; name: RegExp | null }> = {
  lip: { categories: ["lips"], name: null },
  blush: { categories: ["face", "makeup"], name: /blush|cheek/i },
  eyeshadow: { categories: ["eyes", "makeup"], name: /eye ?shadow/i },
  eyeliner: { categories: ["eyes", "makeup"], name: /eye ?liner|kajal|kohl/i },
  brow: { categories: ["eyes", "makeup"], name: /brow/i },
  highlighter: { categories: ["face", "makeup"], name: /highlight|illuminat/i },
  base: { categories: ["face", "makeup"], name: /foundation|cushion|bb cream|cc cream|concealer|skin tint|two way cake/i },
};
const SHADE_CATEGORIES = ["lips", "face", "makeup", "eyes"];
const BASE_LABEL = "Foundation & cushion";
const MATCHES_PER_GROUP = 4;
// CIE76 distances above these are a different colour, not a near shade.
const MAX_PALETTE_DELTA_E = 18;
const MAX_SKIN_DELTA_E = 14;

function kindOf(row: ShadeRow): string[] {
  return Object.entries(SHADE_KINDS)
    .filter(([, kind]) => row.category && kind.categories.includes(row.category) && (!kind.name || kind.name.test(row.name)))
    .map(([id]) => id);
}

function closest(rows: { row: ShadeRow; lab: Lab }[], targets: { swatch: BeautySwatch; lab: Lab }[], maxDeltaE: number): ShadeMatch[] {
  const scored = rows
    .map(({ row, lab }) => {
      let best = targets[0];
      let distance = Infinity;
      for (const target of targets) {
        const d = deltaE76(lab, target.lab);
        if (d < distance) {
          distance = d;
          best = target;
        }
      }
      return { row, distance, best };
    })
    .filter((x) => x.distance <= maxDeltaE)
    .sort((a, b) => a.distance - b.distance);

  // One shade per product line — the catalog lists every shade as its own
  // row, and some lines under more than one parent_sku.
  const seen = new Set<string>();
  const matches: ShadeMatch[] = [];
  for (const { row, distance, best } of scored) {
    const family = row.parent_sku ?? row.id;
    const line = `${row.brand ?? ""}|${row.name}`.toLowerCase();
    if (seen.has(family) || seen.has(line)) continue;
    seen.add(family);
    seen.add(line);
    matches.push({
      productId: row.id,
      parentSku: row.parent_sku ?? row.id,
      name: row.name,
      brand: row.brand ?? "Unbranded",
      price: parseFloat(row.price),
      imageUrl: extractImageUrl(row.image_url),
      category: row.category,
      colorHex: row.color_variant,
      colorName: row.variant_color_name,
      sizeLabel: row.size_label,
      deltaE: Math.round(distance * 10) / 10,
      swatchName: best.swatch.name,
      swatchHex: best.swatch.hex,
    });
    if (matches.length >= MATCHES_PER_GROUP) break;
  }
  return matches;
}

/** In-stock catalog shades closest (CIE76, see lib/color/delta-e.ts) to each
 * category of the season's palette, plus base makeup closest to the skin
 * colour the scan measured. Groups with no near shade come back empty. */
export async function matchCatalogShades(report: BeautyScanReport): Promise<ShadeGroup[]> {
  const palette = report.colour.palette?.categories ?? [];
  const skinHex = report.colour.evidence?.skin ?? null;
  if (palette.length === 0 && !skinHex) return [];

  const { rows } = await pool.query<ShadeRow>(
    `SELECT id, name, brand, price, image_url, category, parent_sku, color_variant, variant_color_name, size_label
     FROM products
     WHERE color_variant IS NOT NULL AND stock_quantity > 0 AND category = ANY($1)`,
    [SHADE_CATEGORIES]
  );

  const byKind = new Map<string, { row: ShadeRow; lab: Lab }[]>();
  for (const row of rows) {
    const lab = hexToLab(row.color_variant);
    if (!lab) continue;
    for (const kind of kindOf(row)) {
      const list = byKind.get(kind) ?? [];
      list.push({ row, lab });
      byKind.set(kind, list);
    }
  }

  const groups: ShadeGroup[] = palette
    .filter((category) => SHADE_KINDS[category.id])
    .map((category) => {
      const targets = category.swatches
        .map((swatch) => ({ swatch, lab: hexToLab(swatch.hex) }))
        .filter((t): t is { swatch: BeautySwatch; lab: Lab } => t.lab !== null);
      return {
        id: category.id,
        label: category.label,
        matches: targets.length ? closest(byKind.get(category.id) ?? [], targets, MAX_PALETTE_DELTA_E) : [],
      };
    });

  const skinLab = skinHex ? hexToLab(skinHex) : null;
  if (skinHex && skinLab) {
    groups.push({
      id: "base",
      label: BASE_LABEL,
      matches: closest(byKind.get("base") ?? [], [{ swatch: { name: "Warna kulitmu", hex: skinHex }, lab: skinLab }], MAX_SKIN_DELTA_E),
    });
  }
  return groups;
}
