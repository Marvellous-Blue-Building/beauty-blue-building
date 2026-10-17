"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useScanStore } from "@/lib/store/scan-store";
import { postJSON, ApiError } from "@/lib/api-client";
import { cropFaceDataUrl } from "@/lib/image-crop";
import { SEVERITY_MARKER } from "@/components/scan/FaceMap";
import { cn } from "@/lib/cn";
import { loadFaceTracker, type LiveFaceTracker } from "@/lib/scan/face-landmarker";
import {
  OVAL_REGION,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  coverCrop,
  faceRegion,
  lightState,
  measureFrame,
  poseState,
  sharpState,
  toViewfinder,
  type Crop,
  type LightState,
  type PoseState,
  type Region,
  type SharpState,
} from "@/lib/scan/quality-gates";
import {
  SCAN_POSES,
  SIDE_MAX_YAW,
  SIDE_MIN_YAW,
  blendshapeScores,
  headTurn,
  poseHint,
  sideFraming,
  type PoseHint,
  type ScanPose,
} from "@/lib/scan/pose-steps";
import type { BeautyScanReport } from "@/types/beauty-scan";
import type { BeautySummary, FlaggedZone, FlaggedZoneSeverity } from "@/types/scan";

type EngineState = "INITIALIZING" | "ALIGNING" | "CAPTURED" | "SCANNING";
type TrackerStatus = "loading" | "ready" | "unavailable";
type Nudge = "left" | "right" | "up" | "down";

interface Gates {
  light: LightState;
  sharp: SharpState;
  /** Framing: inside the oval at a sensible distance (and, facing the
   * camera, looking straight at it). */
  pose: PoseState | "loading" | "unavailable";
  /** The head angle (and, facing the camera, expression) this pose asks for. */
  angle: PoseHint | "loading" | "unavailable";
  /** Which way to move, when the face is off-center in the selfie view. */
  nudge: Nudge | null;
  /** Signed head turn in whole degrees, positive = the user's own right. */
  yaw: number | null;
}

type Tone = "ok" | "warn" | "fail" | "info" | "idle";

type ZoneSlot = "forehead" | "underEye" | "nose" | "leftCheek" | "rightCheek" | "chin";

interface ZoneTag {
  id: string;
  label: string;
  /** null while that zone is still being analyzed. */
  severity: FlaggedZoneSeverity | null;
  /** Position in the viewfinder, 0-1. */
  x: number;
  y: number;
  delayMs: number;
}

/** The captured photo, frozen in the viewfinder while it's analyzed. */
interface FrozenView {
  src: string;
  mirrored: boolean;
  /** The part of the photo the viewfinder shows. */
  crop: Crop;
  /** The face's box in the viewfinder at capture time (camera only). */
  faceBox: Region | null;
}

interface ScanPhotos {
  frames: string[];
  right: string[];
  left: string[];
}

const GATE_INTERVAL_MS = 100; // gates are measured at ~10 Hz
// Each pose is taken once every check has passed continuously for this long:
// 1.2 s facing the camera (v1.1 spec), 0.8 s turned — a turned head is
// harder to hold, and the side photo needs only one sharp frame.
const HOLD_TICKS: Record<ScanPose, number> = { front: 12, right: 8, left: 8 };
// Frames kept while holding: a burst facing the camera (colour and face shape
// read the median of several), a few per side (the sharpest is used).
const BURST: Record<ScanPose, number> = { front: 8, right: 3, left: 3 };
const FRAME_MAX_SIDE = 960;
// A manual shutter takes its own short burst facing the camera (face shape
// needs several frames), a single photo turned.
const MANUAL_BURST: Record<ScanPose, number> = { front: 6, right: 1, left: 1 };
const MANUAL_BURST_GAP_MS = 90;
// How long the "photo saved" card shows before the next pose.
const CAPTURED_MS = 1500;
// Pace of the analysis status steps. The analyzer answers in a second or
// two, so the steps set a minimum scan length (~5 s) instead of flashing
// past; a slower response just holds on the last step.
const SCAN_STEP_MS = 1000;
// Results pop onto the photo one by one, then the report opens.
const RESULT_TAG_STAGGER_MS = 350;
const RESULT_HOLD_MS = 2200;
// Offer a manual shutter if a pose hasn't been taken by then. A turned head
// the tracker misjudges must never leave the user stuck.
const MANUAL_FALLBACK_MS: Record<ScanPose, number> = { front: 6000, right: 5000, left: 5000 };

// Static face-mesh guide (forehead, eyes, cheeks, nose, chin), drawn while no
// live face is tracked — purely visual.
const MESH: [number, number][] = [
  [0.5, 0.2], [0.34, 0.24], [0.66, 0.24], [0.24, 0.34], [0.76, 0.34],
  [0.4, 0.4], [0.6, 0.4], [0.3, 0.46], [0.7, 0.46], [0.5, 0.42],
  [0.5, 0.52], [0.45, 0.58], [0.55, 0.58], [0.5, 0.6],
  [0.3, 0.6], [0.24, 0.66], [0.7, 0.6], [0.76, 0.66],
  [0.5, 0.7], [0.4, 0.72], [0.6, 0.72], [0.5, 0.86],
];
const MESH_EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], [1, 5], [2, 6], [5, 6], [5, 9], [6, 9],
  [9, 10], [10, 11], [10, 12], [13, 14], [13, 17], [18, 19], [18, 20],
  [13, 18], [14, 16], [17, 15], [19, 21], [20, 21], [21, 3], [21, 4],
];

// Where each zone sits within a face box (0-1), for placing callouts.
const SLOT_IN_FACE: Record<ZoneSlot, [number, number]> = {
  forehead: [0.5, 0.14],
  underEye: [0.3, 0.44],
  nose: [0.55, 0.6],
  leftCheek: [0.2, 0.68],
  rightCheek: [0.8, 0.68],
  chin: [0.5, 0.92],
};

const ZONE_LABEL: Record<ZoneSlot, string> = {
  forehead: "zoneForehead",
  underEye: "zoneUnderEye",
  nose: "zoneNose",
  leftCheek: "zoneLeftCheek",
  rightCheek: "zoneRightCheek",
  chin: "zoneChin",
};

// Timed status lines shown while the server analyzes the photos; each step
// lights up the zones it describes.
const SCAN_STEPS: { pct: number; log: string; zones: ZoneSlot[] }[] = [
  { pct: 12, log: "statusMapping", zones: [] },
  { pct: 32, log: "statusColour", zones: ["forehead"] },
  { pct: 54, log: "statusShape", zones: ["underEye", "nose"] },
  { pct: 76, log: "statusCheeksSides", zones: ["leftCheek", "rightCheek"] },
  { pct: 92, log: "statusCompiling", zones: ["chin"] },
];

const SEVERITY_LABEL: Record<FlaggedZoneSeverity, string> = {
  low: "severityLow",
  medium: "severityMedium",
  high: "severityHigh",
};

// Why the analyzer couldn't score a photo (422 `code`) -> what to tell the user.
const ERROR_MESSAGE: Record<string, string> = {
  no_face: "errorNoFace",
  face_too_small: "errorFaceTooSmall",
  no_skin: "errorNoSkin",
  too_dark: "errorTooDark",
  too_blurry: "errorTooBlurry",
};

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-400 shadow-[0_0_8px_#34D399]",
  warn: "bg-amber-400 shadow-[0_0_8px_#FBBF24]",
  fail: "bg-red-500 shadow-[0_0_8px_#EF4444]",
  info: "bg-sky-400 shadow-[0_0_8px_#38BDF8]",
  idle: "bg-white/40",
};

// HUD pill (dot tone + message key) for each gate state.
const LIGHT_PILL: Record<LightState, [Tone, string]> = {
  ok: ["ok", "lightOk"],
  dim: ["fail", "lightDim"],
  glare: ["warn", "lightGlare"],
};
const SHARP_PILL: Record<SharpState, [Tone, string]> = {
  ok: ["ok", "sharpOk"],
  blur: ["warn", "sharpBlur"],
};
const POSE_PILL: Record<Gates["pose"], [Tone, string]> = {
  ok: ["ok", "poseOk"],
  noFace: ["fail", "poseNoFace"],
  offCenter: ["warn", "poseOffCenter"],
  tooFar: ["warn", "poseTooFar"],
  tooClose: ["warn", "poseTooClose"],
  turned: ["warn", "poseTurned"],
  loading: ["idle", "poseLoading"],
  unavailable: ["idle", "poseUnavailable"],
};
const ANGLE_PILL: Record<Gates["angle"], [Tone, string]> = {
  ok: ["ok", "angleOk"],
  lookStraight: ["warn", "angleTurned"],
  levelHead: ["warn", "angleTilted"],
  chinDown: ["warn", "angleTilted"],
  chinUp: ["warn", "angleTilted"],
  closeMouth: ["warn", "angleExpression"],
  relaxFace: ["warn", "angleExpression"],
  turnRight: ["warn", "angleTurnMore"],
  turnLeft: ["warn", "angleTurnMore"],
  turnLess: ["warn", "angleTooFar"],
  loading: ["idle", "poseLoading"],
  unavailable: ["idle", "poseUnavailable"],
};
const POSE_GUIDE: Partial<Record<Gates["pose"], string>> = {
  offCenter: "guideOffCenter",
  tooFar: "guideTooFar",
  tooClose: "guideTooClose",
  turned: "guideTurned",
};
const ANGLE_GUIDE: Record<Exclude<PoseHint, "ok">, string> = {
  lookStraight: "guideTurned",
  levelHead: "guideLevelHead",
  chinDown: "guideChinDown",
  chinUp: "guideChinUp",
  closeMouth: "guideCloseMouth",
  relaxFace: "guideRelaxFace",
  turnRight: "guideTurnRight",
  turnLeft: "guideTurnLeft",
  turnLess: "guideTurnLess",
};
const NUDGE_GUIDE: Record<Nudge, string> = {
  left: "guideMoveLeft",
  right: "guideMoveRight",
  up: "guideMoveUp",
  down: "guideMoveDown",
};

const POSE_LABEL: Record<ScanPose, string> = { front: "poseFront", right: "poseRight", left: "poseLeft" };
const CAPTURED_LABEL: Record<ScanPose, string> = {
  front: "capturedFront",
  right: "capturedRight",
  left: "capturedLeft",
};
const NEXT_LABEL: Record<ScanPose, string> = { front: "nextRight", right: "nextLeft", left: "nextAnalyze" };

// The oval guide (66% x 72% of the viewfinder) as an SVG path starting at the
// top, so the hold-still ring fills clockwise from 12 o'clock.
const OVAL_PATH = "M50 14 A33 36 0 1 1 50 86 A33 36 0 1 1 50 14";

/** Matches a flagged zone's key ("forehead_shine", "cheek_redness"…) — or its
 * name, on older reports — to a zone on the face. */
function slotFor(zone: string): ZoneSlot {
  const lower = zone.toLowerCase();
  if (lower.includes("forehead") || lower.includes("sebum")) return "forehead";
  if (lower.includes("eye")) return "underEye";
  if (lower.includes("nose") || lower.includes("pore")) return "nose";
  if (lower.includes("redness") || lower.includes("erythema")) return "rightCheek";
  if (lower.includes("cheek") || lower.includes("texture")) return "leftCheek";
  if (lower.includes("chin") || lower.includes("barrier")) return "chin";
  return "forehead";
}

function sameGates(a: Gates | null, b: Gates) {
  return (
    a !== null &&
    a.light === b.light &&
    a.sharp === b.sharp &&
    a.pose === b.pose &&
    a.angle === b.angle &&
    a.nudge === b.nudge &&
    a.yaw === b.yaw
  );
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

/** Keeps a callout's center far enough from the edges (and the guidance
 * banner) that its label stays fully visible. */
function tagSpot(x: number, y: number) {
  return { x: clamp(x, 0.24, 0.76), y: clamp(y, 0.1, 0.82) };
}

function slotSpot(box: Region, slot: ZoneSlot) {
  const [rx, ry] = SLOT_IN_FACE[slot];
  return tagSpot(box.x0 + rx * (box.x1 - box.x0), box.y0 + ry * (box.y1 - box.y0));
}

/** A flagged zone's measured position (0-1 in the analyzed photo) mapped onto
 * the frozen viewfinder, falling back to its usual spot on the face. */
function resultSpot(zone: FlaggedZone, view: FrozenView) {
  if (zone.x != null && zone.y != null) {
    let x = (zone.x - view.crop.x) / view.crop.w;
    const y = (zone.y - view.crop.y) / view.crop.h;
    if (view.mirrored) x = 1 - x;
    if (x > 0 && x < 1 && y > 0 && y < 1) return tagSpot(x, y);
  }
  return slotSpot(view.faceBox ?? OVAL_REGION, slotFor(zone.key ?? zone.zone));
}

/** The tracked face's bounding box in the viewfinder. */
function boxOf(points: { x: number; y: number }[] | null): Region | null {
  if (!points?.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  face: { x: number; y: number }[] | null,
  faceOval: { start: number; end: number }[],
  scanning: boolean,
  visible: boolean,
  phase: number
) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (!visible) return;
  ctx.strokeStyle = scanning ? "rgba(224,169,150,0.7)" : "rgba(194,166,122,0.4)";
  ctx.fillStyle = scanning ? "#E0A996" : "#5DE4D4";
  ctx.lineWidth = 1;
  const pulse = scanning ? 1 + Math.sin(phase) * 0.4 : 1;

  if (face) {
    // Live MediaPipe landmarks: face outline plus every 4th mesh point.
    ctx.beginPath();
    for (const { start, end } of faceOval) {
      ctx.moveTo(face[start].x * w, face[start].y * h);
      ctx.lineTo(face[end].x * w, face[end].y * h);
    }
    ctx.stroke();
    for (let i = 0; i < face.length; i += 4) {
      ctx.beginPath();
      ctx.arc(face[i].x * w, face[i].y * h, 1.3 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  for (const [a, b] of MESH_EDGES) {
    ctx.moveTo(MESH[a][0] * w, MESH[a][1] * h);
    ctx.lineTo(MESH[b][0] * w, MESH[b][1] * h);
  }
  ctx.stroke();
  for (const [x, y] of MESH) {
    ctx.beginPath();
    ctx.arc(x * w, y * h, 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" />
    </svg>
  );
}

/** A face outline turned the way a pose asks, for the stepper before its photo. */
function PoseGlyph({ pose }: { pose: ScanPose }) {
  const nose = pose === "front" ? 12 : pose === "right" ? 15 : 9;
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <ellipse cx="12" cy="12" rx={pose === "front" ? 6.5 : 5.5} ry="8" />
      <path d={`M${nose} 10.5v3.2`} />
    </svg>
  );
}

function Chevrons({ side }: { side: "left" | "right" }) {
  const flip = side === "left";
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 gap-0.5 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]",
        flip ? "left-3 flex-row-reverse" : "right-3"
      )}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="h-8 w-5 animate-[turn-nudge_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 140}ms`, ["--nudge" as string]: flip ? "-10px" : "10px" }}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={flip ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
        </svg>
      ))}
    </span>
  );
}

export function NativeSkinScanEngine({
  redirectTo = "/scan/report",
  origin = "scan",
}: {
  redirectTo?: string;
  origin?: "scan" | "checkin";
}) {
  const t = useTranslations("scan");
  const tReport = useTranslations("diagnostic");
  const router = useRouter();
  const setResult = useScanStore((s) => s.setResult);
  const setImage = useScanStore((s) => s.setImage);
  const setOrigin = useScanStore((s) => s.setOrigin);
  const setPoseThumbs = useScanStore((s) => s.setPoseThumbs);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while a manual shutter's burst is being taken — the gates pause.
  const burstingRef = useRef(false);
  // undefined while MediaPipe is loading, null if it couldn't load.
  const trackerRef = useRef<LiveFaceTracker | null | undefined>(undefined);
  const facePointsRef = useRef<{ x: number; y: number }[] | null>(null);
  const meshVisibleRef = useRef(true);
  const stateRef = useRef<EngineState>("INITIALIZING");
  const mirroredRef = useRef(true);
  const readyTicksRef = useRef(0);
  const hadFaceRef = useRef(false);
  const alignSinceRef = useRef<number | null>(null);
  // Disarmed after a failed analysis so auto-capture doesn't resend the same
  // pose in a loop; re-armed once any gate stops passing (the user moved).
  const armedRef = useRef(true);
  const poseIndexRef = useRef(0);
  // Frames kept for each pose while it is held, and the front photo's view.
  const photosRef = useRef<Record<ScanPose, string[]>>({ front: [], right: [], left: [] });
  const frontViewRef = useRef<FrozenView | null>(null);
  const completeRef = useRef<(manual: boolean) => void>(() => {});

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [state, setState] = useState<EngineState>("INITIALIZING");
  const [cameraLive, setCameraLive] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>("loading");
  const [gates, setGates] = useState<Gates | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [lockPulse, setLockPulse] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [poseIndex, setPoseIndex] = useState(0);
  const [thumbs, setThumbs] = useState<Partial<Record<ScanPose, string>>>({});
  const [frozen, setFrozen] = useState<FrozenView | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [done, setDone] = useState(false);
  const [zoneTags, setZoneTags] = useState<ZoneTag[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusLog, setStatusLog] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pose = SCAN_POSES[Math.min(poseIndex, SCAN_POSES.length - 1)];

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mirroredRef.current = facingMode === "user";
  }, [facingMode]);

  useEffect(() => {
    let cancelled = false;
    void loadFaceTracker().then((tracker) => {
      if (cancelled) return;
      trackerRef.current = tracker;
      setTrackerStatus(tracker ? "ready" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /** Back to the first pose, with nothing captured. */
  const resetPoses = useCallback(() => {
    photosRef.current = { front: [], right: [], left: [] };
    frontViewRef.current = null;
    poseIndexRef.current = 0;
    readyTicksRef.current = 0;
    alignSinceRef.current = null;
    setPoseIndex(0);
    setThumbs({});
    setHoldProgress(0);
    setShowManual(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      facePointsRef.current = null;
      resetPoses();
      setCameraLive(false);
      setGates(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setError(null);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraLive(true);
          setState("ALIGNING");
          setStatusLog(t("centerPrompt"));
        };
      }
    } catch {
      setState("ALIGNING");
      setError(t("errorCamera"));
      setStatusLog(t("uploadPrompt"));
    }
  }, [facingMode, stopCamera, resetPoses, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopCamera();
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (capturedTimer.current) clearTimeout(capturedTimer.current);
      if (burstTimer.current) clearTimeout(burstTimer.current);
    };
  }, [startCamera, stopCamera]);

  /** The live frame as the analyzer wants it: not mirrored, at most 960 px. */
  const grabFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  }, []);

  /** A small preview of what the viewfinder shows, mirrored as the user saw it. */
  const grabThumb = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const crop = coverCrop(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (mirroredRef.current) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      video,
      crop.x * video.videoWidth,
      crop.y * video.videoHeight,
      crop.w * video.videoWidth,
      crop.h * video.videoHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  // Measures the live frame against the current pose's checks and drives
  // auto-capture.
  const evaluateGates = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || burstingRef.current) return;
      const current = SCAN_POSES[poseIndexRef.current];

      alignSinceRef.current ??= time;
      if (time - alignSinceRef.current > MANUAL_FALLBACK_MS[current]) setShowManual(true);

      const crop = coverCrop(video.videoWidth, video.videoHeight);
      if (!sampleRef.current) {
        sampleRef.current = document.createElement("canvas");
        sampleRef.current.width = SAMPLE_WIDTH;
        sampleRef.current.height = SAMPLE_HEIGHT;
      }
      const ctx = sampleRef.current.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(
        video,
        crop.x * video.videoWidth,
        crop.y * video.videoHeight,
        crop.w * video.videoWidth,
        crop.h * video.videoHeight,
        0,
        0,
        SAMPLE_WIDTH,
        SAMPLE_HEIGHT
      );
      let framing: Gates["pose"];
      let angle: Gates["angle"];
      let yaw: number | null = null;
      const tracker = trackerRef.current;
      if (tracker) {
        try {
          const result = tracker.landmarker.detectForVideo(video, time);
          const landmarks = result.faceLandmarks[0];
          facePointsRef.current = landmarks
            ? landmarks.map((point) => toViewfinder(point, crop))
            : null;
          const turn = headTurn(landmarks, video.videoHeight / video.videoWidth);
          yaw = turn ? Math.round(turn.yaw) : null;
          if (current === "front") {
            // Framing from the v1.1 gate; the head angle and expression from
            // the same rules the server's face-shape reading applies.
            framing = poseState(landmarks, undefined, crop);
            angle = landmarks
              ? poseHint("front", turn, blendshapeScores(result.faceBlendshapes?.[0]?.categories))
              : "lookStraight";
          } else {
            framing = landmarks ? sideFraming(boxOf(facePointsRef.current)) : "noFace";
            angle = poseHint(current, turn);
          }
        } catch {
          facePointsRef.current = null;
          framing = "noFace";
          angle = "ok";
        }
      } else {
        framing = tracker === null ? "unavailable" : "loading";
        angle = framing;
      }

      // A face just came into view: pulse the oval to show it locked on.
      const face = facePointsRef.current;
      if (face && !hadFaceRef.current) setLockPulse((n) => n + 1);
      hadFaceRef.current = !!face;

      // Selfie view, facing the camera: tell the user which way to move (as in a mirror).
      let nudge: Nudge | null = null;
      if (current === "front" && framing === "offCenter" && face && mirroredRef.current) {
        const box = faceRegion(face);
        const dx = 0.5 - (box.x0 + box.x1) / 2; // mirrored: displayed offset flips
        const dy = (box.y0 + box.y1) / 2 - 0.5;
        if (Math.abs(dx) >= Math.abs(dy)) nudge = dx > 0 ? "left" : "right";
        else nudge = dy > 0 ? "up" : "down";
      }

      // Light and sharpness are judged on the face once it's tracked.
      const stats = measureFrame(
        ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data,
        SAMPLE_WIDTH,
        SAMPLE_HEIGHT,
        face ? faceRegion(face) : undefined
      );

      const next: Gates = {
        light: lightState(stats),
        sharp: sharpState(stats),
        pose: framing,
        angle,
        nudge,
        yaw,
      };
      setGates((prev) => (sameGates(prev, next) ? prev : next));

      const allPass =
        next.light === "ok" && next.sharp === "ok" && next.pose === "ok" && next.angle === "ok";
      if (!allPass || !armedRef.current) {
        // The user has moved since the last failed attempt: allow auto-capture
        // again the next time every gate passes.
        if (!allPass) armedRef.current = true;
        readyTicksRef.current = 0;
        photosRef.current[current] = [];
        setHoldProgress(0);
        return;
      }
      // Back in a good position — the hold-still ring replaces any old error.
      setError(null);
      readyTicksRef.current += 1;
      const ticks = HOLD_TICKS[current];
      setHoldProgress(readyTicksRef.current / ticks);
      // Keep the frames taken while the pose is held: every one passed every check.
      if (readyTicksRef.current > ticks - BURST[current]) {
        const frame = grabFrame();
        if (frame) photosRef.current[current] = [...photosRef.current[current], frame].slice(-BURST[current]);
      }
      if (readyTicksRef.current >= ticks) {
        readyTicksRef.current = 0;
        completeRef.current(false);
      }
    },
    [grabFrame]
  );

  // One loop for the whole component: gates at ~10 Hz while aligning, mesh
  // overlay every frame.
  useEffect(() => {
    let phase = 0;
    let lastEval = 0;
    const loop = (time: number) => {
      phase += 0.05;
      if (stateRef.current === "ALIGNING" && time - lastEval >= GATE_INTERVAL_MS) {
        lastEval = time;
        evaluateGates(time);
      }
      drawOverlay(
        overlayRef.current,
        facePointsRef.current,
        trackerRef.current?.faceOval ?? [],
        stateRef.current === "SCANNING",
        meshVisibleRef.current,
        phase
      );
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [evaluateGates]);

  const runAnalysis = useCallback(
    async (photos: ScanPhotos, view: FrozenView, previews: Partial<Record<ScanPose, string>>) => {
      if (stateRef.current === "SCANNING") return;
      setError(null);
      setZoneTags([]);
      setHoldProgress(0);
      setDone(false);
      setFrozen(view);
      setState("SCANNING");
      setProgress(0);
      alignSinceRef.current = null;

      const box = view.faceBox ?? OVAL_REGION;
      // Plays the status steps at a steady pace and resolves one step after
      // the last, so "Putting your report together…" is readable too.
      const timeline = new Promise<void>((resolve) => {
        let i = 0;
        const nextStep = () => {
          if (i === SCAN_STEPS.length) {
            if (progressTimer.current) clearInterval(progressTimer.current);
            resolve();
            return;
          }
          const step = SCAN_STEPS[i++];
          setProgress(step.pct);
          setStatusLog(t(step.log));
          setZoneTags((tags) => [
            ...tags,
            ...step.zones.map((slot) => ({
              id: slot,
              label: t(ZONE_LABEL[slot]),
              severity: null,
              delayMs: 0,
              ...slotSpot(box, slot),
            })),
          ]);
        };
        nextStep();
        progressTimer.current = setInterval(nextStep, SCAN_STEP_MS);
      });

      try {
        // A failed analysis rejects right away — no waiting out the steps.
        const [beauty] = await Promise.all([
          postJSON<BeautyScanReport>("/api/scan-beauty", photos),
          timeline,
        ]);
        const report = beauty.skinMetrics;
        // Analysis used the full frame; store a head-only crop matching the
        // scan screen's oval guide so the report face section and the progress
        // Day cards both show the face, not the surrounding frame.
        const display = await cropFaceDataUrl(view.src).catch(() => null);
        setProgress(100);
        setStatusLog(t("statusComplete"));
        setDone(true);
        setZoneTags(
          report.flaggedZones.map((zone, i) => {
            const titleKey = `areas.${zone.key}.title`;
            const title = zone.key && tReport.has(titleKey) ? tReport(titleKey) : zone.zone;
            return {
              id: `result-${i}`,
              label: `${title} · ${t(SEVERITY_LABEL[zone.severity] ?? SEVERITY_LABEL.low)}`,
              severity: zone.severity,
              delayMs: i * RESULT_TAG_STAGGER_MS,
              ...resultSpot(zone, view),
            };
          })
        );
        navigator.vibrate?.([15, 60, 15]);
        const summary: BeautySummary = {
          captureMode: beauty.captureMode,
          seasonKey: beauty.colour.season?.key ?? null,
          undertone: beauty.colour.season ? (beauty.colour.undertone ?? null) : null,
          faceShapeKey: beauty.faceShape.shape?.key ?? null,
          skinTypeKey: beauty.skin.analysis.key ?? null,
        };
        setResult({ ...report, beauty: summary }, beauty);
        setPoseThumbs(previews);
        setImage(display?.dataUrl ?? view.src, display?.rect ?? null);
        setOrigin(origin);
        setTimeout(() => router.push(redirectTo), RESULT_HOLD_MS);
      } catch (err) {
        if (progressTimer.current) clearInterval(progressTimer.current);
        armedRef.current = false;
        meshVisibleRef.current = true;
        resetPoses();
        setFrozen(null);
        setProgress(0);
        setZoneTags([]);
        setState("ALIGNING");
        if (err instanceof ApiError && err.status === 422) {
          setError(t(ERROR_MESSAGE[err.code ?? "no_face"] ?? "errorNoFace"));
        } else {
          setError(t("errorGeneric"));
        }
        setStatusLog(t("centerPrompt"));
      }
    },
    [router, redirectTo, setResult, setImage, setOrigin, setPoseThumbs, origin, resetPoses, t, tReport]
  );

  /** One pose is taken: flash, the photo drops into its circle, then the next
   * pose — or, after the third, the analysis. */
  const finishPose = useCallback(
    (current: ScanPose) => {
      const video = videoRef.current;
      if (!video) return;
      if (current === "front") {
        const face = facePointsRef.current;
        let faceBox: Region | null = null;
        const box = boxOf(face);
        if (box) {
          faceBox = mirroredRef.current ? { x0: 1 - box.x1, x1: 1 - box.x0, y0: box.y0, y1: box.y1 } : box;
        }
        const frames = photosRef.current.front;
        frontViewRef.current = {
          src: frames[frames.length - 1],
          mirrored: mirroredRef.current,
          crop: coverCrop(video.videoWidth, video.videoHeight),
          faceBox,
        };
      }
      const thumb = grabThumb();
      const previews = thumb ? { ...thumbs, [current]: thumb } : thumbs;
      setThumbs(previews);
      setFlashKey((k) => k + 1);
      navigator.vibrate?.(35);
      setHoldProgress(1);
      setShowManual(false);
      setState("CAPTURED");

      capturedTimer.current = setTimeout(() => {
        setHoldProgress(0);
        if (poseIndexRef.current < SCAN_POSES.length - 1) {
          poseIndexRef.current += 1;
          readyTicksRef.current = 0;
          alignSinceRef.current = null;
          setPoseIndex(poseIndexRef.current);
          setState("ALIGNING");
          return;
        }
        const photos = photosRef.current;
        const view = frontViewRef.current;
        if (!view) return;
        void runAnalysis({ frames: photos.front, right: photos.right, left: photos.left }, view, previews);
      }, CAPTURED_MS);
    },
    [grabThumb, runAnalysis, thumbs]
  );

  /** Takes the pose: straight away after an automatic hold (its frames were
   * kept while holding), or after a short burst for the manual shutter. */
  const completePose = useCallback(
    (manual: boolean) => {
      const current = SCAN_POSES[poseIndexRef.current];
      if (!videoRef.current || stateRef.current !== "ALIGNING" || burstingRef.current) return;
      if (!manual && photosRef.current[current].length > 0) {
        finishPose(current);
        return;
      }
      const wanted = MANUAL_BURST[current];
      let taken = 0;
      burstingRef.current = true;
      const shoot = () => {
        const frame = grabFrame();
        if (!frame) {
          burstingRef.current = false;
          setError(t("errorCamera"));
          return;
        }
        photosRef.current[current] = [...photosRef.current[current], frame].slice(-BURST[current]);
        taken += 1;
        setHoldProgress(taken / wanted);
        if (taken < wanted) {
          burstTimer.current = setTimeout(shoot, MANUAL_BURST_GAP_MS);
          return;
        }
        burstingRef.current = false;
        finishPose(current);
      };
      shoot();
    },
    [finishPose, grabFrame, t]
  );

  useEffect(() => {
    completeRef.current = completePose;
  }, [completePose]);

  const handleShutter = useCallback(() => completePose(true), [completePose]);

  const handleUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // allow re-selecting the same photo
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const src = reader.result;
        const img = new Image();
        img.onload = () => {
          // The live camera's face mesh doesn't belong on someone's photo.
          meshVisibleRef.current = false;
          facePointsRef.current = null;
          // One photo: front only — every region is read from it.
          void runAnalysis(
            { frames: [src], right: [], left: [] },
            {
              src,
              mirrored: false,
              crop: coverCrop(img.naturalWidth || 3, img.naturalHeight || 4),
              faceBox: null,
            },
            {}
          );
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [runAnalysis]
  );

  const scanning = state === "SCANNING";
  const captured = state === "CAPTURED";
  const side = pose !== "front";
  const allPass =
    gates !== null &&
    gates.light === "ok" &&
    gates.sharp === "ok" &&
    gates.pose === "ok" &&
    gates.angle === "ok";
  const ready = cameraLive && state === "ALIGNING" && allPass && !error;
  const autoAvailable = cameraLive && trackerStatus !== "unavailable";

  const pillRows = gates && [
    [LIGHT_PILL[gates.light], SHARP_PILL[gates.sharp]],
    [ANGLE_PILL[gates.angle], POSE_PILL[gates.pose]],
  ];

  // Banner priority: what's blocking capture first, then "hold still".
  let guidance: string;
  if (scanning) {
    guidance = statusLog;
  } else if (captured) {
    guidance = t(CAPTURED_LABEL[pose]);
  } else if (error) {
    guidance = error;
  } else if (!cameraLive || !gates) {
    guidance = statusLog || t("centerPrompt");
  } else if (gates.light !== "ok") {
    guidance = t(gates.light === "dim" ? "guideDim" : "guideGlare");
  } else if (gates.pose === "unavailable") {
    guidance = t(side ? (pose === "right" ? "guideManualRight" : "guideManualLeft") : "guideManual");
  } else if (gates.nudge) {
    guidance = t(NUDGE_GUIDE[gates.nudge]);
  } else if (POSE_GUIDE[gates.pose]) {
    guidance = t(POSE_GUIDE[gates.pose]!);
  } else if (gates.pose !== "ok") {
    guidance = t(side ? (pose === "right" ? "guideTurnRight" : "guideTurnLeft") : "centerPrompt");
  } else if (gates.angle !== "ok" && gates.angle !== "loading" && gates.angle !== "unavailable") {
    guidance = t(ANGLE_GUIDE[gates.angle]);
  } else if (gates.sharp !== "ok") {
    guidance = t("guideBlur");
  } else {
    guidance = t(side ? "guideHoldAngle" : "guideHold");
  }

  // Which side of the screen "turn to your right" points at: the user's own
  // right is the screen's right in the mirrored selfie view.
  const mirrored = facingMode === "user";
  const turnScreenSide: "left" | "right" = (pose === "right") === mirrored ? "right" : "left";
  const showChevrons =
    cameraLive &&
    state === "ALIGNING" &&
    side &&
    (gates?.angle === "turnRight" || gates?.angle === "turnLeft" || gates?.angle === "unavailable");

  // Head-turn meter: the turn in the selfie view's own direction, ±70°.
  const meterYaw = gates?.yaw ?? 0;
  const meterX = (yaw: number) => clamp(0.5 + (mirrored ? yaw : -yaw) / 140, 0, 1);
  const bandFrom = meterX(pose === "right" ? SIDE_MIN_YAW : -SIDE_MIN_YAW);
  const bandTo = meterX(pose === "right" ? SIDE_MAX_YAW : -SIDE_MAX_YAW);

  const stepper: (ScanPose | "analyze")[] = [...SCAN_POSES, "analyze"];
  const stepIndex = scanning ? 3 : poseIndex;

  return (
    <div className="flex w-full flex-col">
      {/* Three-pose stepper: each circle fills with its photo */}
      <ol className="mb-3 flex items-center px-1" aria-label={t("handsFreeHint")}>
        {stepper.map((key, i) => {
          const isPose = key !== "analyze";
          const thumb = isPose ? thumbs[key] : undefined;
          const isDone = i < stepIndex || (i === 3 && done) || (isPose && !!thumb);
          const isCurrent = i === stepIndex && !isDone;
          return (
            <li key={key} className={cn("flex items-center", i < stepper.length - 1 && "flex-1")}>
              <span className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold transition-colors duration-300",
                    isDone
                      ? "bg-primary text-surface ring-2 ring-primary"
                      : isCurrent
                        ? "animate-[marker-pulse_1.4s_ease-out_infinite] border-2 border-primary bg-surface text-primary"
                        : "border border-border bg-surface text-text-faint"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full animate-[thumb-drop_0.45s_ease-out_both] object-cover"
                    />
                  ) : isPose ? (
                    <PoseGlyph pose={key} />
                  ) : isDone ? (
                    "✓"
                  ) : (
                    "✦"
                  )}
                  {thumb && (
                    <i className="absolute right-0 bottom-0 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white not-italic">
                      ✓
                    </i>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10.5px] font-semibold whitespace-nowrap",
                    i <= stepIndex ? "text-canvas-ink" : "text-text-faint"
                  )}
                >
                  {t(isPose ? POSE_LABEL[key] : "stepAnalyze")}
                </span>
              </span>
              {i < stepper.length - 1 && (
                <span className="mx-1.5 mb-5 h-[2px] flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full bg-primary transition-[width] duration-500"
                    style={{ width: i < stepIndex ? "100%" : "0%" }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[20px] border border-border bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          }`}
        />

        {/* The captured photo, frozen while it's analyzed */}
        {frozen && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frozen.src}
            alt=""
            className={cn(
              "absolute inset-0 z-[5] h-full w-full object-cover",
              frozen.mirrored && "scale-x-[-1]"
            )}
          />
        )}

        <canvas
          ref={overlayRef}
          width={360}
          height={480}
          className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          }`}
        />

        {/* Alignment oval (dims everything outside it); pulses when a face locks on */}
        <div
          key={`oval-${lockPulse}`}
          className={cn(
            "pointer-events-none absolute top-1/2 left-1/2 z-10 h-[72%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-[50%/56%] border-2 transition-all duration-300",
            lockPulse > 0 && !scanning && "animate-[lock-on_0.6s_ease-out]",
            scanning
              ? "border-solid border-mint shadow-[0_0_0_2000px_rgba(10,8,12,0.5),0_0_30px_rgba(224,169,150,0.7)]"
              : ready || captured
                ? "border-solid border-emerald-500 shadow-[0_0_0_2000px_rgba(10,8,12,0.28),0_0_24px_rgba(16,185,129,0.5)]"
                : "border-dashed border-mint/70 shadow-[0_0_0_2000px_rgba(10,8,12,0.38)]"
          )}
        />

        {/* Hold-still ring: fills around the oval, then the photo is taken */}
        {cameraLive && !scanning && holdProgress > 0 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]"
            aria-hidden="true"
          >
            <path
              d={OVAL_PATH}
              pathLength={100}
              fill="none"
              stroke="#34D399"
              strokeWidth={5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={100}
              strokeDashoffset={100 - Math.min(1, holdProgress) * 100}
              className="transition-[stroke-dashoffset] duration-100 ease-linear"
            />
          </svg>
        )}

        {/* Corner brackets */}
        <span className="pointer-events-none absolute top-3.5 left-3.5 z-10 h-5 w-5 rounded-tl-md border-t-[2.5px] border-l-[2.5px] border-mint" />
        <span className="pointer-events-none absolute top-3.5 right-3.5 z-10 h-5 w-5 rounded-tr-md border-t-[2.5px] border-r-[2.5px] border-mint" />
        <span className="pointer-events-none absolute bottom-3.5 left-3.5 z-10 h-5 w-5 rounded-bl-md border-b-[2.5px] border-l-[2.5px] border-mint" />
        <span className="pointer-events-none absolute right-3.5 bottom-3.5 z-10 h-5 w-5 rounded-br-md border-r-[2.5px] border-b-[2.5px] border-mint" />

        {/* Which way to turn */}
        {showChevrons && <Chevrons side={turnScreenSide} />}

        {/* Holographic laser sweep */}
        {scanning && !done && (
          <div className="pointer-events-none absolute top-[12%] right-0 left-0 z-20 h-[3px] animate-[scan-laser_2.2s_ease-in-out_infinite_alternate] bg-[linear-gradient(90deg,transparent_5%,var(--color-mint)_25%,#fff_50%,var(--color-mint)_75%,transparent_95%)] shadow-[0_0_16px_4px_var(--color-mint)]" />
        )}

        {/* Validation gates HUD */}
        {cameraLive && state === "ALIGNING" && pillRows && (
          <div className="absolute top-2.5 right-2.5 left-2.5 z-20 flex flex-col gap-1.5">
            {pillRows.map((row, r) => (
              <div key={r} className="flex justify-between gap-1.5">
                {row.map(([tone, key]) => (
                  <span
                    key={key}
                    className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-2 py-1 font-mono text-[9.5px] font-bold text-white backdrop-blur-md"
                  >
                    <i className={cn("h-[7px] w-[7px] rounded-full", TONE_DOT[tone])} />
                    {t(key)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Photo saved — and what comes next */}
        {captured && (
          <div className="pointer-events-none absolute inset-x-6 top-[38%] z-30 animate-[pose-pop_0.45s_ease-out_both] rounded-2xl border border-emerald-400/60 bg-black/80 px-4 py-3 text-center text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <p className="text-[15px] font-bold">✓ {t(CAPTURED_LABEL[pose])}</p>
            <p className="mt-1 text-[12px] text-white/85">{t(NEXT_LABEL[pose])}</p>
          </div>
        )}

        {/* Zone callouts, on the face */}
        {zoneTags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 animate-[zone-tag-in_0.35s_ease-out_both] rounded-full border bg-black/85 px-2 py-0.5 font-mono text-[9px] font-bold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)]",
              tag.severity ? "border-white/70 px-2.5 py-1 text-[10px]" : "border-mint"
            )}
            style={{
              left: `${tag.x * 100}%`,
              top: `${tag.y * 100}%`,
              animationDelay: `${tag.delayMs}ms`,
            }}
          >
            <i
              className={cn(
                "mr-1 inline-block h-[6px] w-[6px] rounded-full align-middle",
                tag.severity
                  ? (SEVERITY_MARKER[tag.severity] ?? SEVERITY_MARKER.low)
                  : "animate-pulse bg-mint"
              )}
            />
            {tag.label}
          </span>
        ))}

        {/* Guidance + status */}
        <div
          aria-live="polite"
          className={cn(
            "absolute right-3 bottom-3 left-3 z-20 rounded-xl border bg-black/80 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-md transition-all duration-200",
            done
              ? "border-emerald-500 text-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              : scanning
                ? "border-mint shadow-[0_0_20px_rgba(224,169,150,0.4)]"
                : ready || captured
                  ? "border-emerald-500 text-emerald-50"
                  : "border-white/10"
          )}
        >
          {guidance}
        </div>

        {/* Capture flash */}
        {flashKey > 0 && (
          <div
            key={`flash-${flashKey}`}
            className="pointer-events-none absolute inset-0 z-30 animate-[capture-flash_0.5s_ease-out_both] bg-white"
          />
        )}
      </div>

      {/* Head-turn meter, for the side photos */}
      {cameraLive && side && !scanning && (
        <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <div className="mb-1.5 flex justify-between text-[11px] font-bold text-canvas-ink">
            <span>{t("meterLabel")}</span>
            <span className="font-mono text-primary tabular-nums">
              {gates?.yaw != null ? `${Math.abs(gates.yaw)}°` : "—"}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-surface-2">
            <span
              className={cn(
                "absolute inset-y-0 rounded-full transition-colors",
                gates?.angle === "ok" ? "bg-emerald-400/70" : "bg-primary/30"
              )}
              style={{
                left: `${Math.min(bandFrom, bandTo) * 100}%`,
                width: `${Math.abs(bandTo - bandFrom) * 100}%`,
              }}
            />
            <span className="absolute inset-y-[-3px] left-1/2 w-[2px] -translate-x-1/2 rounded bg-text-faint" />
            {gates?.yaw != null && (
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-primary shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-[left] duration-100 ease-linear"
                style={{ left: `${meterX(meterYaw) * 100}%` }}
              />
            )}
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-canvas-ink-muted">
            {t(pose === "right" ? "meterHintRight" : "meterHintLeft")}
          </p>
        </div>
      )}

      {/* Analysis progress */}
      {scanning && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3">
          <div className="mb-1 flex justify-between text-xs font-bold text-canvas-ink">
            <span>{t("progressLabel")}</span>
            <span className="font-mono text-primary tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-gradient-to-r from-secondary via-mint to-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {!scanning && (
        <>
          {autoAvailable && !side && (
            <p className="mt-3 text-center text-[11.5px] leading-relaxed text-canvas-ink-muted">
              {t("handsFreeHint")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {!side && (
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition",
                  cameraLive
                    ? "border-border bg-surface text-canvas-ink hover:bg-surface-2"
                    : "border-primary bg-primary text-surface"
                )}
              >
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <UploadIcon />
                {t("uploadPhoto")}
              </label>
            )}
            {cameraLive && state === "ALIGNING" && (showManual || !autoAvailable) && (
              <button
                type="button"
                onClick={handleShutter}
                className="flex items-center gap-1.5 rounded-full border border-primary bg-primary-dim px-3.5 py-2 text-[12px] font-semibold text-canvas-ink transition hover:bg-mint-dim"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                {t(side ? "takeSidePhotoNow" : "takePhotoNow")}
              </button>
            )}
            {cameraLive && state === "ALIGNING" && poseIndex > 0 && (
              <button
                type="button"
                onClick={() => {
                  resetPoses();
                  setError(null);
                }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-semibold text-canvas-ink transition hover:bg-surface-2"
              >
                ↺ {t("restartPoses")}
              </button>
            )}
            {cameraLive && !side && (
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === "user" ? "environment" : "user"))
                }
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-semibold text-canvas-ink transition hover:bg-surface-2"
              >
                <FlipIcon />
                {t("flipCamera")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
