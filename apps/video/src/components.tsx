import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily, glassPanel } from "./theme";

/** Photo backdrop + soft orbs, like the app's admin frame. */
export function Backdrop({ image = "images/dashboard-bg.jpg", blur = 0 }: { image?: string; blur?: number }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 900], [1.06, 1.14], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.cream, overflow: "hidden" }}>
      <Img src={staticFile(image)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${drift})`, filter: blur ? `blur(${blur}px)` : undefined }} />
      <AbsoluteFill style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.45), rgba(255,255,255,0.15) 55%, rgba(255,255,255,0.4))" }} />
      <div style={{ position: "absolute", width: 560, height: 560, left: -180, bottom: 120, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #fff6f2 0%, #f2ded7 22%, #efc5b9 52%, #d9907d 100%)", opacity: 0.85 }} />
      <div style={{ position: "absolute", width: 380, height: 380, right: -120, top: 140, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #ffffff 0%, #f2ded7 35%, #e3a0b6 100%)", opacity: 0.8 }} />
    </AbsoluteFill>
  );
}

export function useSpringIn(delay = 0, damping = 14) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } });
}

/** Fades a whole scene in and out at its edges. */
export function SceneFade({ children, duration, fadeIn = 12, fadeOut = 12 }: { children: ReactNode; duration: number; fadeIn?: number; fadeOut?: number }) {
  const frame = useCurrentFrame();
  // interpolate() needs strictly increasing input, so a zero-length fade is simply left out.
  const fadeInK = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const fadeOutK = fadeOut > 0 ? interpolate(frame, [duration - fadeOut, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const opacity = Math.min(fadeInK, fadeOutK);
  return <AbsoluteFill style={{ opacity, fontFamily }}>{children}</AbsoluteFill>;
}

export function Sparkle({ size = 48, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  );
}

export function LogoMark({ size = 120 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: C.pink, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 24px 50px -16px rgba(210,98,135,0.75), inset 0 2px 0 rgba(255,255,255,0.35)" }}>
      <Sparkle size={size * 0.52} />
    </div>
  );
}

/** Glass pill used for callouts and chips. */
export function Chip({ children, style, dot = true }: { children: ReactNode; style?: React.CSSProperties; dot?: boolean }) {
  return (
    <div style={{ ...glassPanel, display: "inline-flex", alignItems: "center", gap: 14, borderRadius: 999, padding: "18px 28px", fontSize: 30, fontWeight: 600, color: C.ink, ...style }}>
      {dot && <span style={{ width: 14, height: 14, borderRadius: "50%", background: C.pink, boxShadow: "0 0 0 6px rgba(210,98,135,0.18)" }} />}
      {children}
    </div>
  );
}

/** Springs a child in (scale + rise) from `at` and out at `until` (frames, relative to the parent sequence). */
export function PopIn({ at, until, children, style, from = 40 }: { at: number; until?: number; children: ReactNode; style?: React.CSSProperties; from?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: frame - at, fps, config: { damping: 13, mass: 0.6 } });
  const outP = until === undefined ? 0 : interpolate(frame, [until - 8, until], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < at || (until !== undefined && frame > until)) return null;
  const k = inP * (1 - outP);
  return <div style={{ position: "absolute", opacity: k, transform: `translateY(${(1 - inP) * from}px) scale(${0.9 + 0.1 * inP})`, ...style }}>{children}</div>;
}
