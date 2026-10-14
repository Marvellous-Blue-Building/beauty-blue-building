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
  colorCast,
  coverCrop,
  faceRegion,
  lightState,
  measureFrame,
  poseState,
  sharpState,
  toViewfinder,
  type ColorCast,
  type Crop,
  type LightState,
  type PoseState,
  type Region,
  type SharpState,
} from "@/lib/scan/quality-gates";
import type { FlaggedZone, FlaggedZoneSeverity, ScanReport } from "@/types/scan";

type EngineState = "INITIALIZING" | "ALIGNING" | "SCANNING";
type TrackerStatus = "loading" | "ready" | "unavailable";
type Nudge = "left" | "right" | "up" | "down";

interface Gates {
  light: LightState;
  sharp: SharpState;
  pose: PoseState | "loading" | "unavailable";
  color: ColorCast;
  /** Which way to move, when the face is off-center in the selfie view. */
  nudge: Nudge | null;
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

const GATE_INTERVAL_MS = 100; // gates are measured at ~10 Hz
// v1.1 spec: auto-capture once every gate has passed continuously for 1.2 s.
const AUTO_CAPTURE_TICKS = 1200 / GATE_INTERVAL_MS;
// Pace of the analysis status steps. The local analyzer answers in well under
// a second, so the steps set a minimum scan length (~5 s) instead of flashing
// past; a slower response just holds on the last step.
const SCAN_STEP_MS = 1000;
// Results pop onto the photo one by one, then the report opens.
const RESULT_TAG_STAGGER_MS = 350;
const RESULT_HOLD_MS = 2200;
// Offer a manual "Take photo now" if auto-capture hasn't fired by then.
const MANUAL_FALLBACK_MS = 6000;

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

// Timed status lines shown while the server analyzes the frame; each step
// lights up the zones it describes.
const SCAN_STEPS: { pct: number; log: string; zones: ZoneSlot[] }[] = [
  { pct: 12, log: "statusMapping", zones: [] },
  { pct: 32, log: "statusCalibrating", zones: ["forehead"] },
  { pct: 54, log: "statusTzone", zones: ["underEye", "nose"] },
  { pct: 76, log: "statusCheeks", zones: ["leftCheek", "rightCheek"] },
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
const COLOR_PILL: Record<ColorCast, [Tone, string]> = {
  neutral: ["ok", "colorNeutral"],
  warm: ["info", "colorWarm"],
  cool: ["info", "colorCool"],
};

const POSE_GUIDE: Partial<Record<Gates["pose"], string>> = {
  offCenter: "guideOffCenter",
  tooFar: "guideTooFar",
  tooClose: "guideTooClose",
  turned: "guideTurned",
};
const NUDGE_GUIDE: Record<Nudge, string> = {
  left: "guideMoveLeft",
  right: "guideMoveRight",
  up: "guideMoveUp",
  down: "guideMoveDown",
};

const STEPS = ["stepPosition", "stepHold", "stepAnalyze"] as const;

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
    a.color === b.color &&
    a.nudge === b.nudge
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
  const shutterRef = useRef<() => void>(() => {});

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [state, setState] = useState<EngineState>("INITIALIZING");
  const [cameraLive, setCameraLive] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>("loading");
  const [gates, setGates] = useState<Gates | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [lockPulse, setLockPulse] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [frozen, setFrozen] = useState<FrozenView | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [done, setDone] = useState(false);
  const [zoneTags, setZoneTags] = useState<ZoneTag[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusLog, setStatusLog] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      facePointsRef.current = null;
      readyTicksRef.current = 0;
      alignSinceRef.current = null;
      setHoldProgress(0);
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
  }, [facingMode, stopCamera, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopCamera();
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [startCamera, stopCamera]);

  // Measures the live frame against the 4 gates and drives auto-capture.
  const evaluateGates = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;

    alignSinceRef.current ??= time;
    if (time - alignSinceRef.current > MANUAL_FALLBACK_MS) setShowManual(true);

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
    let pose: Gates["pose"];
    const tracker = trackerRef.current;
    if (tracker) {
      try {
        const result = tracker.landmarker.detectForVideo(video, time);
        const landmarks = result.faceLandmarks[0];
        facePointsRef.current = landmarks
          ? landmarks.map((point) => toViewfinder(point, crop))
          : null;
        pose = poseState(landmarks, result.facialTransformationMatrixes?.[0], crop);
      } catch {
        facePointsRef.current = null;
        pose = "noFace";
      }
    } else {
      pose = tracker === null ? "unavailable" : "loading";
    }

    // A face just came into view: pulse the oval to show it locked on.
    const face = facePointsRef.current;
    if (face && !hadFaceRef.current) setLockPulse((n) => n + 1);
    hadFaceRef.current = !!face;

    // Selfie view only: tell the user which way to move (as in a mirror).
    let nudge: Nudge | null = null;
    if (pose === "offCenter" && face && mirroredRef.current) {
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
      pose,
      color: colorCast(stats),
      nudge,
    };
    setGates((prev) => (sameGates(prev, next) ? prev : next));

    const allPass = next.light === "ok" && next.sharp === "ok" && next.pose === "ok";
    if (!allPass || !armedRef.current) {
      // The user has moved since the last failed attempt: allow auto-capture
      // again the next time every gate passes.
      if (!allPass) armedRef.current = true;
      readyTicksRef.current = 0;
      setHoldProgress(0);
      return;
    }
    // Back in a good position — the hold-still ring replaces any old error.
    setError(null);
    readyTicksRef.current += 1;
    setHoldProgress(readyTicksRef.current / AUTO_CAPTURE_TICKS);
    if (readyTicksRef.current >= AUTO_CAPTURE_TICKS) {
      readyTicksRef.current = 0;
      shutterRef.current();
    }
  }, []);

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

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const runAnalysis = useCallback(
    async (imageBase64: string, view: FrozenView) => {
      if (state === "SCANNING") return;
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
        const [report] = await Promise.all([
          postJSON<ScanReport>("/api/scan-analyze", { imageBase64 }),
          timeline,
        ]);
        // Analysis used the full frame; store a head-only crop matching the
        // scan screen's oval guide so the report face section and the progress
        // Day cards both show the face, not the surrounding frame.
        const display = await cropFaceDataUrl(imageBase64).catch(() => null);
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
        setResult(report);
        setImage(display?.dataUrl ?? imageBase64, display?.rect ?? null);
        setOrigin(origin);
        setTimeout(() => router.push(redirectTo), RESULT_HOLD_MS);
      } catch (err) {
        if (progressTimer.current) clearInterval(progressTimer.current);
        armedRef.current = false;
        readyTicksRef.current = 0;
        meshVisibleRef.current = true;
        setShowManual(true);
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
    [router, redirectTo, setResult, setImage, setOrigin, origin, state, t, tReport]
  );

  const handleShutter = useCallback(() => {
    const video = videoRef.current;
    const frame = captureFrame();
    if (!frame || !video) {
      setError(t("errorCamera"));
      return;
    }
    const face = facePointsRef.current;
    let faceBox: Region | null = null;
    if (face) {
      const xs = face.map((p) => p.x);
      const ys = face.map((p) => p.y);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      faceBox = mirroredRef.current
        ? { x0: 1 - x1, x1: 1 - x0, y0: Math.min(...ys), y1: Math.max(...ys) }
        : { x0, x1, y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    // The capture moment: flash, a tap of haptics, and the frame freezes.
    setFlashKey((k) => k + 1);
    navigator.vibrate?.(35);
    runAnalysis(frame, {
      src: frame,
      mirrored: mirroredRef.current,
      crop: coverCrop(video.videoWidth, video.videoHeight),
      faceBox,
    });
  }, [captureFrame, runAnalysis, t]);

  useEffect(() => {
    shutterRef.current = handleShutter;
  }, [handleShutter]);

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
          runAnalysis(src, {
            src,
            mirrored: false,
            crop: coverCrop(img.naturalWidth || 3, img.naturalHeight || 4),
            faceBox: null,
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [runAnalysis]
  );

  const scanning = state === "SCANNING";
  const allPass =
    gates !== null && gates.light === "ok" && gates.sharp === "ok" && gates.pose === "ok";
  const ready = cameraLive && !scanning && allPass && !error;
  const autoAvailable = cameraLive && trackerStatus !== "unavailable";
  const step = scanning ? 2 : ready ? 1 : 0;

  const pillRows = gates && [
    [LIGHT_PILL[gates.light], SHARP_PILL[gates.sharp]],
    [POSE_PILL[gates.pose], COLOR_PILL[gates.color]],
  ];

  // Banner priority: what's blocking capture first, then "hold still".
  let guidance: string;
  if (scanning) {
    guidance = statusLog;
  } else if (error) {
    guidance = error;
  } else if (!cameraLive || !gates) {
    guidance = statusLog || t("centerPrompt");
  } else if (gates.light !== "ok") {
    guidance = t(gates.light === "dim" ? "guideDim" : "guideGlare");
  } else if (gates.pose === "unavailable") {
    guidance = t("guideManual");
  } else if (gates.nudge) {
    guidance = t(NUDGE_GUIDE[gates.nudge]);
  } else if (POSE_GUIDE[gates.pose]) {
    guidance = t(POSE_GUIDE[gates.pose]!);
  } else if (gates.pose !== "ok") {
    guidance = t("centerPrompt");
  } else if (gates.sharp !== "ok") {
    guidance = t("guideBlur");
  } else {
    guidance = t("guideHold");
  }

  return (
    <div className="flex w-full flex-col">
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
              : ready
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

        {/* Holographic laser sweep */}
        {scanning && !done && (
          <div className="pointer-events-none absolute top-[12%] right-0 left-0 z-20 h-[3px] animate-[scan-laser_2.2s_ease-in-out_infinite_alternate] bg-[linear-gradient(90deg,transparent_5%,var(--color-mint)_25%,#fff_50%,var(--color-mint)_75%,transparent_95%)] shadow-[0_0_16px_4px_var(--color-mint)]" />
        )}

        {/* Validation gates HUD */}
        {cameraLive && !scanning && pillRows && (
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
                : ready
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

      {/* Progress through the hands-free flow */}
      {(cameraLive || scanning) && (
        <ol className="mt-4 flex items-center px-2" aria-label={t("handsFreeHint")}>
          {STEPS.map((key, i) => (
            <li key={key} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              <span className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300",
                    i < step || (i === step && done)
                      ? "bg-primary text-surface"
                      : i === step
                        ? "animate-[marker-pulse_1.4s_ease-out_infinite] border-2 border-primary bg-surface text-primary"
                        : "border border-border bg-surface text-text-faint"
                  )}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i < step || (i === step && done) ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[10.5px] font-semibold whitespace-nowrap",
                    i <= step ? "text-canvas-ink" : "text-text-faint"
                  )}
                >
                  {t(key)}
                </span>
              </span>
              {i < STEPS.length - 1 && (
                <span className="mx-2 mb-5 h-[2px] flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full bg-primary transition-[width] duration-500"
                    style={{ width: i < step ? "100%" : "0%" }}
                  />
                </span>
              )}
            </li>
          ))}
        </ol>
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
          {autoAvailable && (
            <p className="mt-3 text-center text-[11.5px] leading-relaxed text-canvas-ink-muted">
              {t("handsFreeHint")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
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
            {cameraLive && (showManual || !autoAvailable) && (
              <button
                type="button"
                onClick={handleShutter}
                className="flex items-center gap-1.5 rounded-full border border-primary bg-primary-dim px-3.5 py-2 text-[12px] font-semibold text-canvas-ink transition hover:bg-mint-dim"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                {t("takePhotoNow")}
              </button>
            )}
            {cameraLive && (
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
