/**
 * The beauty profile's two visuals that come from the result itself: the
 * outline of the face shape, and the season's own palette colours. The
 * embeddable widget (public/widget-loader.js) draws the same from its own copy.
 */

import type { BeautyScanReport, BeautySwatch } from "@/types/beauty-scan";

type IconProps = { size?: number; className?: string };

/** Face outlines in a 24x24 box — the silhouette each shape is named for. */
export const FACE_SHAPE_PATH: Record<string, string> = {
  oval: "M12 2.5c4 0 7 4.2 7 9.5s-3 9.5-7 9.5-7-4.2-7-9.5 3-9.5 7-9.5z",
  round: "M12 3.2c4.8 0 8.4 3.9 8.4 8.8S16.8 20.8 12 20.8 3.6 16.9 3.6 12 7.2 3.2 12 3.2z",
  square: "M5.4 6c0-2.2 2.2-3.3 6.6-3.3s6.6 1.1 6.6 3.3v9.2c0 2.6-1.5 4.6-3.6 5.6H9c-2.1-1-3.6-3-3.6-5.6z",
  long: "M12 1.6c3.2 0 5.4 2.4 5.4 5.6v9.6c0 3.4-2.3 5.6-5.4 5.6s-5.4-2.2-5.4-5.6V7.2c0-3.2 2.2-5.6 5.4-5.6z",
  heart: "M4.4 7.6C4.4 4.4 7.6 2.8 12 2.8s7.6 1.6 7.6 4.8c0 5.6-4 10.9-7.6 13.6C8.4 18.5 4.4 13.2 4.4 7.6z",
  diamond: "M12 2.4c2.1 0 3.6 1.7 4.7 4.2l2.9 5.2c-1.6 4.2-4.4 7.9-7.6 9.8-3.2-1.9-6-5.6-7.6-9.8l2.9-5.2C8.4 4.1 9.9 2.4 12 2.4z",
  triangle: "M9 2.8h6l3.6 11.4c.8 2.9-.4 5.6-3 6.6-1.1.4-2.3.6-3.6.6s-2.5-.2-3.6-.6c-2.6-1-3.8-3.7-3-6.6z",
};

export function FaceShapeIcon({
  shape,
  size = 16,
  className,
  draw,
}: IconProps & { shape: string | null | undefined; draw?: boolean }) {
  const d = (shape && FACE_SHAPE_PATH[shape]) || FACE_SHAPE_PATH.oval;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path
        d={d}
        pathLength={1}
        fill="currentColor"
        fillOpacity={0.14}
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
        className={draw ? "animate-[beauty-draw_1.1s_ease-out_0.1s_forwards] [stroke-dasharray:1] [stroke-dashoffset:1]" : undefined}
      />
      {/* eyes and mouth, faint, so the outline reads as a face */}
      <circle cx="9.6" cy="11" r="0.9" fill="currentColor" opacity={0.55} />
      <circle cx="14.4" cy="11" r="0.9" fill="currentColor" opacity={0.55} />
      <path d="M10.4 15.6c1 .7 2.2.7 3.2 0" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" opacity={0.55} />
    </svg>
  );
}

/** Up to `n` colours from the season's palette, one per category first —
 * lipstick, blush, eyeshadow, highlighter, eyeliner, brows — then seconds. */
export function paletteSwatches(colour: BeautyScanReport["colour"], n: number): BeautySwatch[] {
  const byId = new Map((colour.palette?.categories ?? []).map((c) => [c.id, c.swatches]));
  const order = ["lip", "blush", "eyeshadow", "highlighter", "eyeliner", "brow"];
  const out: BeautySwatch[] = [];
  for (let round = 0; round < 3 && out.length < n; round++) {
    for (const id of order) {
      const swatch = byId.get(id)?.[round];
      if (swatch && /^#[0-9a-fA-F]{6}$/.test(swatch.hex) && out.length < n) out.push(swatch);
    }
  }
  return out;
}
