import type { ScanReport } from "@/types/scan";

/**
 * Result of a beauty scan — services/skin-scanning `/analyze-beauty` (colour
 * season, face shape and skin type), plus the catalog shades this app matches to the season's palette. Shared by the
 * /scan report and the embeddable widget.
 */

export interface BeautyNamed {
  key: string;
  displayName: string;
}

export interface BeautySwatch {
  name: string;
  hex: string;
}

export type BeautyPoseKey = "front" | "right" | "left";

export interface BeautyColourAttribute {
  axis: "value" | "chroma" | "warmth";
  label: string;
  measured: boolean;
  score: number;
  /** 0-1 along the axis, negative pole to positive pole. */
  position: number;
  verdict: string;
  negativeLabel: string;
  positiveLabel: string;
}

export interface BeautyColour {
  season:
    | (BeautyNamed & {
        family: string;
        confidence: number;
        confidencePercent: number;
        conclusive: boolean;
        runnerUp: BeautyNamed | null;
      })
    | null;
  undertone?: "warm" | "cool" | "neutral";
  description?: string;
  attributes?: BeautyColourAttribute[];
  evidence?: {
    skin: string | null;
    hair: string | null;
    hasHair: boolean;
    headCovered: boolean;
    skinLightness: number;
  };
  palette?: {
    status: string;
    categories: { id: string; label: string; swatches: BeautySwatch[] }[];
  };
  caveat?: string;
  remedyKey?: string | null;
  remedyText?: string | null;
}

export interface BeautyShapeAxis {
  axis: "proportion" | "widest_point" | "jaw_definition";
  label: string;
  position: number;
  band: string;
  verdict: string;
  lowLabel: string;
  midLabel?: string;
  highLabel: string;
}

export interface BeautyLook {
  key: string;
  displayName: string;
  character: string;
  fit: string;
  fitLabel: string;
  tier: "best" | "one_touch" | "worth_trying";
  note: string;
  imageUrl: string;
}

export interface BeautyFaceShape {
  shape:
    | (BeautyNamed & {
        confidencePercent: number;
        alsoFits: BeautyNamed | null;
      })
    | null;
  source?: {
    remedy: string;
    framesUsed: number;
    /** "approximate" when it was read from slightly off-angle frames. */
    quality?: "measured" | "approximate";
  };
  axes?: BeautyShapeAxis[];
  description?: string;
  alsoFitsText?: string | null;
  coveredNote?: string | null;
  approximateNote?: string | null;
  looks?: { title: string; ranked: BeautyLook[] };
  caveat?: string;
  remedyText?: string | null;
}

export type BeautySkinRegionKey = "dahi" | "hidung" | "pipi_kiri" | "pipi_kanan" | "dagu";

export interface BeautySkinRegion {
  tipe: BeautySkinRegionKey;
  label: string;
  measured: boolean;
  /** Which photo the region was read from — each cheek from the side photo facing it. */
  source: BeautyPoseKey;
  bersinar: number | null;
  warna_kulit_merata: number | null;
  pori_besar: number | null;
  noda_hitam: number | null;
  jerawat: number | null;
  garis_halus: number | null;
}

export interface BeautySkin {
  captureMode: string;
  analysis: { summary: string; key: string; detail: BeautySkinRegion[] };
  caveat?: string;
}

export interface BeautyPose {
  pose: BeautyPoseKey;
  visibleCheek: "both" | "left" | "right";
  received: number;
  accepted: boolean;
  /** ok, no_face, not_turned, wrong_way, turned_too_far, missing */
  reason: string;
  yawDegrees: number | null;
}

export interface ShadeMatch {
  productId: string;
  parentSku: string;
  name: string;
  brand: string;
  price: number;
  imageUrl: string | null;
  category: string | null;
  colorHex: string;
  colorName: string | null;
  /** Optional for scan reports saved before variant sizes were included. */
  sizeLabel?: string | null;
  deltaE: number;
  /** The palette swatch (or, for base makeup, the measured skin) it is closest to. */
  swatchName: string;
  swatchHex: string;
}

export interface ShadeGroup {
  id: string;
  label: string;
  matches: ShadeMatch[];
}

export interface BeautyScanReport {
  scanId: string;
  createdAt: string;
  /** "three-pose", "front+right", "front+left" or "single-front". */
  captureMode: string;
  language: "id" | "en";
  poses?: BeautyPose[];
  colour: BeautyColour;
  faceShape: BeautyFaceShape;
  skin: BeautySkin;
  /** The same frame's /analyze skin scores — what routine matching uses. */
  skinMetrics: ScanReport;
  caveat?: string;
  /** Added by this app: catalog shades for the season's palette. */
  catalogShades?: ShadeGroup[];
}
