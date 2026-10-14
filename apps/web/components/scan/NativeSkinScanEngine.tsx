"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useScanStore } from "@/lib/store/scan-store";
import { postJSON, ApiError } from "@/lib/api-client";
import { cropFaceDataUrl } from "@/lib/image-crop";
import type { ScanReport } from "@/types/scan";

type EngineState = "INITIALIZING" | "ALIGNING" | "SCANNING";

// Normalized face-mesh keypoints (forehead, eyes, cheeks, nose, chin) drawn
// over the live feed as a biometric guide — purely visual; the actual face
// detection runs server-side in services/skin-scanning.
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

export function NativeSkinScanEngine({
  redirectTo = "/scan/report",
  origin = "scan",
}: {
  redirectTo?: string;
  origin?: "scan" | "checkin";
}) {
  const t = useTranslations("scan");
  const router = useRouter();
  const setResult = useScanStore((s) => s.setResult);
  const setImage = useScanStore((s) => s.setImage);
  const setOrigin = useScanStore((s) => s.setOrigin);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [state, setState] = useState<EngineState>("INITIALIZING");
  const [progress, setProgress] = useState(0);
  const [statusLog, setStatusLog] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
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

  // Draw the biometric mesh overlay.
  useEffect(() => {
    let phase = 0;
    const loop = () => {
      phase += 0.05;
      const canvas = overlayRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const { width: w, height: h } = canvas;
        ctx.clearRect(0, 0, w, h);
        const scanning = state === "SCANNING";
        ctx.strokeStyle = scanning
          ? "rgba(224,169,150,0.7)"
          : "rgba(194,166,122,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [a, b] of MESH_EDGES) {
          ctx.moveTo(MESH[a][0] * w, MESH[a][1] * h);
          ctx.lineTo(MESH[b][0] * w, MESH[b][1] * h);
        }
        ctx.stroke();
        ctx.fillStyle = scanning ? "#E0A996" : "#5DE4D4";
        for (const [x, y] of MESH) {
          const pulse = scanning ? 1 + Math.sin(phase) * 0.4 : 1;
          ctx.beginPath();
          ctx.arc(x * w, y * h, 2.4 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [state]);

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
    async (imageBase64: string) => {
      if (state === "SCANNING") return;
      setError(null);
      setState("SCANNING");
      setProgress(8);

      const steps = [
        { pct: 28, log: t("statusCalibrating") },
        { pct: 52, log: t("statusTzone") },
        { pct: 74, log: t("statusCheeks") },
        { pct: 90, log: t("statusCompiling") },
      ];
      let i = 0;
      progressTimer.current = setInterval(() => {
        if (i < steps.length) {
          setProgress(steps[i].pct);
          setStatusLog(steps[i].log);
          i++;
        }
      }, 650);

      try {
        const report = await postJSON<ScanReport>("/api/scan-analyze", {
          imageBase64,
        });
        if (progressTimer.current) clearInterval(progressTimer.current);
        // Analysis used the full frame; store a head-only crop matching the
        // scan screen's oval guide so the report face section and the progress
        // Day cards both show the face, not the surrounding frame.
        const displayImage = await cropFaceDataUrl(imageBase64).catch(() => imageBase64);
        setProgress(100);
        setStatusLog(t("statusComplete"));
        setResult(report);
        setImage(displayImage);
        setOrigin(origin);
        setTimeout(() => router.push(redirectTo), 650);
      } catch (err) {
        if (progressTimer.current) clearInterval(progressTimer.current);
        setProgress(0);
        setState("ALIGNING");
        if (err instanceof ApiError && err.status === 422) {
          setError(t("errorNoFace"));
        } else {
          setError(t("errorGeneric"));
        }
        setStatusLog(t("centerPrompt"));
      }
    },
    [router, redirectTo, setResult, setImage, setOrigin, origin, state, t]
  );

  const handleShutter = useCallback(() => {
    const frame = captureFrame();
    if (frame) {
      runAnalysis(frame);
    } else {
      setError(t("errorCamera"));
    }
  }, [captureFrame, runAnalysis, t]);

  const handleUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") runAnalysis(reader.result);
      };
      reader.readAsDataURL(file);
    },
    [runAnalysis]
  );

  const scanning = state === "SCANNING";

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
        <canvas
          ref={overlayRef}
          width={360}
          height={480}
          className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${
            facingMode === "user" ? "scale-x-[-1]" : ""
          }`}
        />

        {/* Alignment oval */}
        <div
          className={`pointer-events-none absolute top-1/2 left-1/2 z-10 h-[72%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-[50%/56%] border-2 transition-all duration-300 ${
            scanning
              ? "border-mint shadow-[0_0_30px_rgba(224,169,150,0.6)]"
              : "border-dashed border-mint/70"
          }`}
        />

        {/* Holographic laser sweep */}
        {scanning && (
          <div className="absolute top-1/3 right-0 left-0 z-20 h-1 animate-pulse bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_20px_#E0A996]" />
        )}

        {/* HUD */}
        <div className="absolute top-3 right-3 left-3 z-20 flex justify-between">
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur-md">
            <i className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399]" />
            {t("lightingOptimal")}
          </span>
          <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur-md">
            {t("landmarksLive")}
          </span>
        </div>

        {/* Guidance + status */}
        <div className="absolute right-3 bottom-3 left-3 z-20 rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-md">
          {error ?? statusLog ?? t("centerPrompt")}
        </div>
      </div>

      {/* Progress */}
      {scanning && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3">
          <div className="mb-1 flex justify-between text-xs font-bold text-canvas-ink">
            <span>{t("progressLabel")}</span>
            <span className="font-mono text-primary tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-gradient-to-r from-secondary via-mint to-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between px-4">
        <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-sm font-bold transition hover:bg-surface-2">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          ⇧
        </label>

        <button
          type="button"
          onClick={handleShutter}
          disabled={scanning}
          aria-label={t("capture")}
          className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary shadow-lg transition ${
            scanning ? "cursor-not-allowed opacity-50" : "hover:scale-105 active:scale-95"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-mint to-primary font-bold text-white">
            ●
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFacingMode((prev) => (prev === "user" ? "environment" : "user"))
          }
          aria-label={t("flipCamera")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-base transition hover:bg-surface-2"
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
