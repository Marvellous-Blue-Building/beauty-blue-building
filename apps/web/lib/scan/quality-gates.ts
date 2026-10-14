/**
 * Live pre-capture quality gates for the scan viewfinder — the 4 "validation
 * gates" from the v1.1 native-engine spec (light, sharpness, pose, white
 * balance). They only decide *when* a frame is good enough to send: the skin
 * metrics themselves are still computed server-side by services/skin-scanning
 * from the captured photo.
 *
 * Thresholds are the v1.1 prototype's, applied to a small downsampled frame.
 * They're capture-quality heuristics, not calibrated photometry, so the HUD
 * reports qualitative states ("Too dim") rather than lux or Kelvin values.
 */

import type { Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

/** Size of the downsampled viewfinder frame the gates are measured on. */
export const SAMPLE_WIDTH = 120;
export const SAMPLE_HEIGHT = 160;

/** The viewfinder's aspect ratio (width / height) — `aspect-[3/4]`. */
export const VIEWFINDER_ASPECT = 3 / 4;

// Oval guide geometry, as fractions of the viewfinder — keep in sync with the
// oval in components/scan/NativeSkinScanEngine.tsx and lib/image-crop.ts.
const OVAL_WIDTH = 0.66;
const OVAL_HEIGHT = 0.72;

/** A box in viewfinder coordinates (0-1). */
export interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const OVAL_REGION: Region = {
  x0: 0.5 - OVAL_WIDTH / 2,
  x1: 0.5 + OVAL_WIDTH / 2,
  y0: 0.5 - OVAL_HEIGHT / 2,
  y1: 0.5 + OVAL_HEIGHT / 2,
};

/** The inner part of the tracked face's box — mostly skin, not the hair or
 * background around it — so a bright wall behind the head isn't "glare". */
export function faceRegion(points: { x: number; y: number }[]): Region {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = maxX - minX;
  const h = maxY - minY;
  return { x0: minX + 0.15 * w, x1: maxX - 0.15 * w, y0: minY + 0.1 * h, y1: maxY - 0.05 * h };
}

const MIN_BRIGHTNESS = 55; // mean luma (0-255) on the face
const GLARE_LUMA = 225; // a pixel at least this bright counts as specular glare
const MAX_GLARE_RATIO = 0.18; // share of glare pixels on the face
const MIN_SHARPNESS = 28; // Laplacian variance at the face center; lower = blur
const WARM_RB_RATIO = 1.35;
const COOL_RB_RATIO = 0.85;

// The spec asks for yaw/pitch within ±5°. MediaPipe's per-frame head-pose
// estimate jitters by a few degrees, which makes 5° hard to hold for the whole
// auto-capture window, so the gate allows 10°.
const MAX_HEAD_ANGLE_DEG = 10;
const MAX_CENTER_OFFSET = 0.1; // face-box center vs. oval center
const MIN_FACE_WIDTH = 0.38; // face-box width, as a fraction of the viewfinder
const MAX_FACE_WIDTH = 0.78;

export interface FrameStats {
  brightness: number;
  glareRatio: number;
  sharpness: number;
  rbRatio: number;
}

export type LightState = "ok" | "dim" | "glare";
export type SharpState = "ok" | "blur";
export type PoseState =
  | "ok"
  | "noFace"
  | "offCenter"
  | "tooFar"
  | "tooClose"
  | "turned";
export type ColorCast = "neutral" | "warm" | "cool";

/** The part of the video frame the 3:4 viewfinder shows (CSS `object-cover`),
 * normalized to the video frame. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function coverCrop(videoWidth: number, videoHeight: number): Crop {
  const videoAspect = videoWidth / videoHeight;
  if (videoAspect > VIEWFINDER_ASPECT) {
    const w = VIEWFINDER_ASPECT / videoAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = videoAspect / VIEWFINDER_ASPECT;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** Maps a video-normalized point to viewfinder-normalized coordinates. */
export function toViewfinder(
  point: { x: number; y: number },
  crop: Crop
): { x: number; y: number } {
  return { x: (point.x - crop.x) / crop.w, y: (point.y - crop.y) / crop.h };
}

/**
 * Measures one downsampled viewfinder frame (RGBA, `width` x `height`).
 * Brightness, glare and color are taken inside `region` (the tracked face, or
 * the oval guide before a face is found); sharpness is the variance of a
 * 4-neighbour Laplacian over the middle of that region.
 */
export function measureFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  region: Region = OVAL_REGION
): FrameStats {
  const luma = (i: number) =>
    0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const row = width * 4;

  const x0 = Math.max(1, Math.floor(width * region.x0));
  const x1 = Math.min(width - 1, Math.ceil(width * region.x1));
  const y0 = Math.max(1, Math.floor(height * region.y0));
  const y1 = Math.min(height - 1, Math.ceil(height * region.y1));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sx0 = Math.floor(cx - 0.23 * (x1 - x0));
  const sx1 = Math.ceil(cx + 0.23 * (x1 - x0));
  const sy0 = Math.floor(cy - 0.25 * (y1 - y0));
  const sy1 = Math.ceil(cy + 0.25 * (y1 - y0));

  let lumSum = 0;
  let glare = 0;
  let rSum = 0;
  let bSum = 0;
  let n = 0;
  let lapSum = 0;
  let lapSqSum = 0;
  let lapN = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const lum = luma(i);
      lumSum += lum;
      rSum += data[i];
      bSum += data[i + 2];
      n++;
      if (lum >= GLARE_LUMA) glare++;

      if (x >= sx0 && x < sx1 && y >= sy0 && y < sy1) {
        const lap = Math.abs(
          4 * lum - luma(i - row) - luma(i + row) - luma(i - 4) - luma(i + 4)
        );
        lapSum += lap;
        lapSqSum += lap * lap;
        lapN++;
      }
    }
  }

  const lapMean = lapSum / (lapN || 1);
  return {
    brightness: lumSum / (n || 1),
    glareRatio: glare / (n || 1),
    sharpness: lapSqSum / (lapN || 1) - lapMean * lapMean,
    rbRatio: bSum > 0 ? rSum / bSum : 1,
  };
}

export function lightState(stats: FrameStats): LightState {
  if (stats.brightness < MIN_BRIGHTNESS) return "dim";
  if (stats.glareRatio > MAX_GLARE_RATIO) return "glare";
  return "ok";
}

export function sharpState(stats: FrameStats): SharpState {
  return stats.sharpness < MIN_SHARPNESS ? "blur" : "ok";
}

/** Informational only: the analyzer doesn't white-balance, so a color cast
 * is reported to the user but never blocks capture. */
export function colorCast(stats: FrameStats): ColorCast {
  if (stats.rbRatio > WARM_RB_RATIO) return "warm";
  if (stats.rbRatio < COOL_RB_RATIO) return "cool";
  return "neutral";
}

/**
 * Head-pose gate from MediaPipe's live face landmarks: the face must be
 * inside the oval, at a sensible distance, and looking at the camera.
 */
export function poseState(
  landmarks: NormalizedLandmark[] | undefined,
  matrix: Matrix | undefined,
  crop: Crop
): PoseState {
  if (!landmarks?.length) return "noFace";

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const landmark of landmarks) {
    const p = toViewfinder(landmark, crop);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const faceWidth = maxX - minX;
  if (faceWidth < MIN_FACE_WIDTH) return "tooFar";
  if (faceWidth > MAX_FACE_WIDTH) return "tooClose";

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if (Math.abs(cx - 0.5) > MAX_CENTER_OFFSET || Math.abs(cy - 0.5) > MAX_CENTER_OFFSET) {
    return "offCenter";
  }

  if (matrix && headAngleDeg(matrix) > MAX_HEAD_ANGLE_DEG) return "turned";
  return "ok";
}

/**
 * The larger of yaw and pitch, in degrees, from the 4x4 facial transformation
 * matrix: how far the face's forward axis (the rotation's third column) points
 * away from the camera axis. Taking absolute values means the result doesn't
 * depend on whether the matrix is stored row- or column-major (a rotation's
 * transpose is its inverse) or which way the canonical face model faces, and
 * atan2 of ratios cancels any uniform scale in the transform.
 */
export function headAngleDeg(matrix: Matrix): number {
  const fx = Math.abs(matrix.data[8]);
  const fy = Math.abs(matrix.data[9]);
  const fz = Math.abs(matrix.data[10]);
  const yaw = Math.atan2(fx, fz);
  const pitch = Math.atan2(fy, fz);
  return (Math.max(yaw, pitch) * 180) / Math.PI;
}
