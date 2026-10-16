import type { FaceLandmarker } from "@mediapipe/tasks-vision";

// Must match the exact @mediapipe/tasks-vision version in package.json — the
// WASM runtime and the JS bundle are released together.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
// Same model bundle services/skin-scanning fetches in scripts/download_model.py.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

export interface LiveFaceTracker {
  landmarker: FaceLandmarker;
  /** Landmark index pairs outlining the face, for the viewfinder mesh. */
  faceOval: { start: number; end: number }[];
}

let loading: Promise<LiveFaceTracker | null> | null = null;

/**
 * Lazily loads MediaPipe's in-browser FaceLandmarker (VIDEO mode) once per
 * page session and shares it between scan screens. Only landmarks leave it —
 * no image is sent anywhere by this. Resolves to null if the WASM runtime or
 * model can't load (offline, blocked CDN, unsupported browser); the scan still
 * works then, minus the live pose gate and auto-capture.
 */
export function loadFaceTracker(): Promise<LiveFaceTracker | null> {
  loading ??= create().then((tracker) => {
    if (!tracker) loading = null; // let the next scan screen retry
    return tracker;
  });
  return loading;
}

async function create(): Promise<LiveFaceTracker | null> {
  // MediaPipe's WASM runtime grabs console.error when it starts and prints its
  // own INFO lines through it ("INFO: Created TensorFlow Lite XNNPACK delegate
  // for CPU."), which the Next.js dev overlay reports as an error. Starting the
  // runtime under this filter makes MediaPipe keep the filtered version; the
  // app's console.error is restored as soon as it has started.
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    consoleError.apply(console, args);
  };
  try {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
          // Expression scores, so the front photo waits for a neutral face.
          outputFaceBlendshapes: true,
        });
        return { landmarker, faceOval: FaceLandmarker.FACE_LANDMARKS_FACE_OVAL };
      } catch {
        // GPU delegate unsupported on this device — fall back to CPU.
      }
    }
  } catch {
    // Runtime failed to load — handled by returning null below.
  } finally {
    console.error = consoleError;
  }
  return null;
}
