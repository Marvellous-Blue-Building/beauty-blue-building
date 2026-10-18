import type { ReactNode } from "react";
import { Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, glassPanel } from "../theme";
import { type Cue, type Cut, f, voiceLength } from "./timeline";

/** The scene's voice-over lines, each starting at its cue. Silent cut: nothing. */
export function VoiceTrack({ cues, voice }: { cues: Cue[]; voice: boolean }) {
  if (!voice) return null;
  return (
    <>
      {cues.map((c) => (
        <Sequence key={c.voice} from={f(c.at)} durationInFrames={f(voiceLength(c.voice)) + 6} layout="none">
          <Audio src={staticFile(`voice/${c.voice}.mp3`)} />
        </Sequence>
      ))}
    </>
  );
}

/** "1 · Personalized Beauty Advisor" — which pillar this scene is. */
export function ChapterTag({ n, label, style }: { n: number; label: string; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 6, fps, config: { damping: 15, mass: 0.6 } });
  return (
    <div style={{ position: "absolute", display: "flex", alignItems: "center", gap: 16, opacity: p, transform: `translateX(${(1 - p) * -40}px)`, ...style }}>
      <div style={{ width: 58, height: 58, borderRadius: 18, background: C.pink, color: "#fff", fontSize: 30, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 30px -12px rgba(210,98,135,0.85)" }}>{n}</div>
      <div style={{ ...glassPanel, borderRadius: 999, padding: "12px 26px", fontSize: 28, fontWeight: 600, color: C.ink }}>{label}</div>
    </div>
  );
}

export interface Caption {
  /** Seconds from scene start. */
  from: number;
  to: number;
  title: string;
  sub?: string;
}

/** Captions, one at a time, springing in where `style` puts them. */
export function Captions({ items, style, align = "left", titleSize = 54 }: { items: Caption[]; style: React.CSSProperties; align?: "left" | "center"; titleSize?: number }) {
  return (
    <>
      {items.map((c) => (
        <Sequence key={c.title + c.from} from={f(c.from)} durationInFrames={Math.max(1, f(c.to) - f(c.from))} layout="none">
          <CaptionBody {...c} style={style} align={align} titleSize={titleSize} />
        </Sequence>
      ))}
    </>
  );
}

function CaptionBody({ title, sub, style, align, titleSize }: Caption & { style: React.CSSProperties; align: "left" | "center"; titleSize: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 15, mass: 0.6 } });
  return (
    <div style={{ position: "absolute", textAlign: align, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, ...style }}>
      <div style={{ fontSize: titleSize, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.1, color: C.ink }}>{title}</div>
      {sub && <div style={{ fontSize: Math.round(titleSize * 0.52), color: C.muted, marginTop: 12, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

/** A zoom/pan keyframe over a WxH picture: show `scale`x, centred on (cx, cy) in its pixels. */
export interface Shot {
  at: number;
  scale: number;
  cx: number;
  cy: number;
}

/** Eases between shots; the picture never pans past its own edges. */
export function Camera({ shots, width, height, children }: { shots: Shot[]; width: number; height: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let a = shots[0], b = shots[0];
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].at <= t) a = shots[i];
    if (shots[i].at > t) { b = shots[i]; break; }
    b = shots[i];
  }
  // Each move takes 1.2s, ending at the next shot's time.
  const k = b === a ? 1 : interpolate(t, [Math.max(a.at, b.at - 1.2), b.at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const s = a.scale + (b.scale - a.scale) * k;
  const cx = a.cx + (b.cx - a.cx) * k;
  const cy = a.cy + (b.cy - a.cy) * k;
  const tx = Math.min(0, Math.max(width - width * s, width / 2 - cx * s));
  const ty = Math.min(0, Math.max(height - height * s, height / 2 - cy * s));
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>{children}</div>
    </div>
  );
}

/** Plays a cut list over one clip, back to back (each stretch at its own rate). */
export function CutClip({ src, cuts, style }: { src: string; cuts: Cut[]; style?: React.CSSProperties }) {
  let acc = 0;
  return (
    <>
      {cuts.map((c, i) => {
        const from = f(acc);
        const len = f(acc + c.length) - from;
        acc += c.length;
        return (
          <Sequence key={i} from={from} durationInFrames={len} layout="none">
            <OffthreadVideo src={staticFile(src)} muted trimBefore={f(c.from)} playbackRate={(c.to - c.from) / c.length} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }} />
          </Sequence>
        );
      })}
    </>
  );
}
