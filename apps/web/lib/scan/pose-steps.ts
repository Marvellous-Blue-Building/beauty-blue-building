/**
 * The three poses of the scan — face the camera, turn to your right, turn to
 * your left. Each cheek is read from the side photo that faces it, so the
 * skin result sees both cheeks straight on instead of foreshortened.
 *
 * Head angles come from the live MediaPipe landmarks the same way
 * services/skin-scanning reads them (app/beauty/face_shape.py `head_pose`,
 * app/beauty/poses.py `turn`), and the front photo is held to the server's
 * face-shape gates, so what the camera accepts is what the server can read.
 * The embeddable widget (public/widget-loader.js) carries a copy of this
 * logic in plain JS.
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Region } from "@/lib/scan/quality-gates";

export type ScanPose = "front" | "right" | "left";
export const SCAN_POSES: ScanPose[] = ["front", "right", "left"];

/** +1 = the user's own right. */
const DIRECTION: Record<ScanPose, number> = { front: 0, right: 1, left: -1 };

// Facing the camera: the server's face-shape gates (face_shape.py) — a frame
// that passes here is one the face-shape reading will use.
const FRONT_MAX_YAW = 10;
const FRONT_MAX_ASYMMETRY = 0.18;
const FRONT_MAX_ROLL = 10;
const FRONT_PITCH_WINDOW = 20;
// ...and the expression limits of its relaxed tier: the camera asks only about
// a clear smile, an open mouth or raised brows — natural brows a little high
// can't be "relaxed" away — and the server decides whether the frames are
// neutral enough for a measured result or an estimate. Blinks are left to the
// server, which keeps the frames without one.
const MAX_MOUTH_OPEN = 0.05;
const MAX_JAW_OPEN = 0.25;
const MAX_SMILE = 0.5;
const MAX_BROW_RAISE = 0.75;
// Turned: a natural turn is enough — from 20° (the server accepts 15°-70°),
// and no nod check, which the side photos' cheek reading doesn't need.
export const SIDE_MIN_YAW = 20;
export const SIDE_MAX_YAW = 60;
const SIDE_MAX_ROLL = 20;
// A level head reads ~18° on this mesh's forehead-chin depth line (the
// server's face_shape.PITCH_NEUTRAL_DEGREES).
const PITCH_NEUTRAL = 18;

// Framing for the side photos: a turned face is narrower, so it is judged by
// height, and allowed further off centre than the front.
const SIDE_MIN_FACE_HEIGHT = 0.34;
const SIDE_MAX_FACE_HEIGHT = 0.85;
const SIDE_CENTRE_TOLERANCE = 0.24;

// MediaPipe 478-point mesh; right / left are the user's own.
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const RIGHT_EDGE = 234;
const LEFT_EDGE = 454;
const EYE_OUTER_R = 33;
const EYE_OUTER_L = 263;
const UPPER_LIP = 13;
const LOWER_LIP = 14;

export interface HeadTurn {
  /** Signed degrees, positive = turned to the user's own right. */
  yaw: number;
  /** Degrees away from a level head; negative = chin raised. */
  pitch: number;
  roll: number;
  /** Nose off-centre between the face edges, 0-1. */
  asymmetry: number;
  /** Lip gap over face height. */
  mouthGap: number;
}

function degrees(opposite: number, adjacent: number) {
  return adjacent <= 1e-6 ? 90 : (Math.atan2(opposite, adjacent) * 180) / Math.PI;
}

/**
 * Head turn from the raw (unmirrored) landmarks: the turn's size from the depth between the face edges, its
 * direction from where the nose sits between them — by landmark identity,
 * so it holds whether or not the preview is mirrored.
 */
export function headTurn(landmarks: NormalizedLandmark[] | undefined, heightOverWidth: number): HeadTurn | null {
  if (!landmarks || landmarks.length < 468) return null;
  const p = landmarks;
  const span = Math.abs(p[LEFT_EDGE].x - p[RIGHT_EDGE].x);
  const height = Math.abs(p[CHIN].y - p[FOREHEAD].y) * heightOverWidth;
  if (span <= 1e-5 || height <= 1e-5) return null;

  const toRight = Math.abs(p[NOSE_TIP].x - p[RIGHT_EDGE].x);
  const toLeft = Math.abs(p[LEFT_EDGE].x - p[NOSE_TIP].x);
  const offset = (toLeft - toRight) / (toLeft + toRight);
  let size = degrees(Math.abs(p[LEFT_EDGE].z - p[RIGHT_EDGE].z), span);
  if (size < 0.5) size = (Math.asin(Math.min(1, Math.abs(offset))) * 180) / Math.PI;

  const ex = p[EYE_OUTER_L].x - p[EYE_OUTER_R].x;
  const ey = (p[EYE_OUTER_L].y - p[EYE_OUTER_R].y) * heightOverWidth;
  return {
    yaw: offset >= 0 ? size : -size,
    pitch: degrees(p[CHIN].z - p[FOREHEAD].z, height) - PITCH_NEUTRAL,
    roll: (Math.atan2(Math.abs(ey), Math.abs(ex)) * 180) / Math.PI,
    asymmetry: Math.abs(offset),
    mouthGap: Math.abs(p[LOWER_LIP].y - p[UPPER_LIP].y) / Math.abs(p[CHIN].y - p[FOREHEAD].y),
  };
}

/** MediaPipe's expression scores by name (outputFaceBlendshapes). */
export type Blendshapes = Record<string, number>;

export function blendshapeScores(
  categories: { categoryName: string; score: number }[] | undefined
): Blendshapes | null {
  if (!categories?.length) return null;
  return Object.fromEntries(categories.map((c) => [c.categoryName, c.score]));
}

/** What the user should do next for this pose; "ok" when it is held right. */
export type PoseHint =
  | "ok"
  | "lookStraight"
  | "levelHead"
  | "chinDown"
  | "chinUp"
  | "closeMouth"
  | "relaxFace"
  | "turnRight"
  | "turnLeft"
  | "turnLess";

/** The next thing to fix for this pose, with the face-shape gates for the
 * front photo so the camera never takes a front frame the server can't read. */
export function poseHint(pose: ScanPose, turn: HeadTurn | null, expression: Blendshapes | null = null): PoseHint {
  if (!turn) return pose === "front" ? "lookStraight" : pose === "right" ? "turnRight" : "turnLeft";
  const dir = DIRECTION[pose];
  if (dir === 0) {
    if (Math.abs(turn.yaw) > FRONT_MAX_YAW || turn.asymmetry > FRONT_MAX_ASYMMETRY) return "lookStraight";
    if (turn.roll > FRONT_MAX_ROLL) return "levelHead";
    if (turn.pitch < -FRONT_PITCH_WINDOW) return "chinDown";
    if (turn.pitch > FRONT_PITCH_WINDOW) return "chinUp";
    if (turn.mouthGap > MAX_MOUTH_OPEN || (expression?.jawOpen ?? 0) > MAX_JAW_OPEN) return "closeMouth";
    if (expression) {
      const smile = 0.5 * ((expression.mouthSmileLeft ?? 0) + (expression.mouthSmileRight ?? 0));
      const brows = Math.max(
        expression.browInnerUp ?? 0,
        0.5 * ((expression.browOuterUpLeft ?? 0) + (expression.browOuterUpRight ?? 0))
      );
      if (smile > MAX_SMILE || brows > MAX_BROW_RAISE) return "relaxFace";
    }
    return "ok";
  }
  const turned = turn.yaw * dir;
  if (turned < SIDE_MIN_YAW) return dir > 0 ? "turnRight" : "turnLeft";
  if (turned > SIDE_MAX_YAW) return "turnLess";
  if (turn.roll > SIDE_MAX_ROLL) return "levelHead";
  return "ok";
}

export type SideFraming = "ok" | "noFace" | "tooFar" | "tooClose" | "offCenter";

/** Framing for a side pose, on the face's box in viewfinder coordinates. */
export function sideFraming(box: Region | null): SideFraming {
  if (!box) return "noFace";
  const height = box.y1 - box.y0;
  if (height < SIDE_MIN_FACE_HEIGHT) return "tooFar";
  if (height > SIDE_MAX_FACE_HEIGHT) return "tooClose";
  if (Math.abs((box.x0 + box.x1) / 2 - 0.5) > SIDE_CENTRE_TOLERANCE) return "offCenter";
  if (Math.abs((box.y0 + box.y1) / 2 - 0.5) > SIDE_CENTRE_TOLERANCE + 0.06) return "offCenter";
  return "ok";
}
