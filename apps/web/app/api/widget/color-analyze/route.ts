import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { touchWidgetSession } from "@/lib/widget/session";
import { hexToLab, deltaE76 } from "@/lib/color/delta-e";
import { extractImageUrl } from "@/lib/rag/image-url";

const SKIN_SCAN_SERVICE_URL = process.env.SKIN_SCAN_SERVICE_URL ?? "http://localhost:3003";

interface ColorAnalyzeServiceResponse {
  skinToneHex: string;
  labL: number;
  labA: number;
  labB: number;
  itaAngle: number;
  undertone: "warm" | "cool" | "neutral";
  depthCategory: "fair" | "light" | "medium" | "tan" | "deep";
}

interface ShadeRow {
  id: string;
  name: string;
  brand: string | null;
  price: string;
  image_url: string | null;
  category: string | null;
  color_variant: string;
  variant_color_name: string | null;
}

/**
 * POST /api/widget/color-analyze — calls services/skin-scanning's new
 * /analyze-color (Lab extraction + undertone), then ranks real catalog
 * shades (products.color_variant, a real hex value for 7,466/24,941 rows)
 * by CIE76 Delta-E distance in the same Lab space. New feature end to end —
 * nothing like this existed before Phase 3 (see the plan).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { imageBase64?: string; sessionId?: string } | null;
  if (!body?.imageBase64 || !body?.sessionId) {
    return NextResponse.json({ error: "missing_image_or_session" }, { status: 400 });
  }

  const sessionValid = await touchWidgetSession(body.sessionId);
  if (!sessionValid) {
    return NextResponse.json({ error: "invalid_session" }, { status: 404 });
  }

  let colorResult: ColorAnalyzeServiceResponse;
  try {
    const res = await fetch(`${SKIN_SCAN_SERVICE_URL}/analyze-color`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: body.imageBase64 }),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as { detail?: { code?: string; message?: string } } | null;
      return NextResponse.json(
        { error: errBody?.detail?.code ?? "color_analysis_failed", message: errBody?.detail?.message },
        { status: res.status }
      );
    }
    colorResult = (await res.json()) as ColorAnalyzeServiceResponse;
  } catch {
    return NextResponse.json({ error: "service_unreachable" }, { status: 503 });
  }

  const skinLab = { l: colorResult.labL, a: colorResult.labA, b: colorResult.labB };

  // Shade data lives mostly on makeup/face/lip/eye categories — scope the
  // scan there rather than ranking every category that happens to have a
  // color_variant (e.g. a handful of hair-dye or nail-polish rows).
  const { rows } = await pool.query<ShadeRow>(
    `SELECT id, name, brand, price, image_url, category, color_variant, variant_color_name
     FROM products
     WHERE color_variant IS NOT NULL
       AND stock_quantity > 0
       AND category = ANY($1)
     LIMIT 4000`,
    [["face", "makeup", "lips", "eyes"]]
  );

  const ranked = rows
    .map((row) => {
      const lab = hexToLab(row.color_variant);
      if (!lab) return null;
      return { row, distance: deltaE76(skinLab, lab) };
    })
    .filter((x): x is { row: ShadeRow; distance: number } => x !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map(({ row, distance }) => ({
      id: row.id,
      name: row.name,
      brand: row.brand ?? "Unbranded",
      price: parseFloat(row.price),
      imageUrl: extractImageUrl(row.image_url),
      category: row.category,
      colorHex: row.color_variant,
      colorName: row.variant_color_name,
      deltaE: Math.round(distance * 10) / 10,
    }));

  return NextResponse.json({
    skinToneHex: colorResult.skinToneHex,
    undertone: colorResult.undertone,
    depthCategory: colorResult.depthCategory,
    shades: ranked,
  });
}
