import { loadFont } from "@remotion/google-fonts/Inter";

/** Same glassmorphism tokens as the app (apps/web/app/globals.css, docs/admin-ui-guidelines.md). */
export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export const C = {
  pink: "#d26287",
  pinkStrong: "#b0476d",
  ink: "#404040",
  muted: "#6b6264",
  blush: "#f2ded7",
  cream: "#f8f3ef",
};

export const glassPanel: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.62), rgba(255,255,255,0.32))",
  border: "1.5px solid rgba(255,255,255,0.75)",
  boxShadow: "0 30px 80px -30px rgba(64,40,48,0.45), inset 0 1.5px 0 rgba(255,255,255,0.85)",
  backdropFilter: "blur(30px) saturate(160%)",
  WebkitBackdropFilter: "blur(30px) saturate(160%)",
};

export const sec = (s: number) => Math.round(s * FPS);
