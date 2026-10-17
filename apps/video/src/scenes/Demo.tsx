import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Chip, PopIn, SceneFade } from "../components";
import marks from "../demo-marks.json";
import { C, glassPanel, sec } from "../theme";

const M = marks.marks as Record<string, number>;

/** On-screen captions, timed to the beats the recorder logged (src/demo-marks.json). */
const CAPTIONS: { from: keyof typeof M; to: keyof typeof M; title: string; sub?: string; step?: string }[] = [
  { from: "store", to: "openWidget", title: "This is RUPA, a demo beauty store.", sub: "It added one line of code to get an AI beauty advisor." },
  { from: "openWidget", to: "scanGuide", title: "Meet Vera.", sub: "An AI beauty advisor, right inside the store." },
  { from: "scanGuide", to: "scanStart", title: "Tap Scan.", sub: "Three photos. One beauty profile." },
  { from: "poseFrontCue", to: "poseRightCue", step: "1", title: "Face the camera", sub: "Hands-free — it snaps when you hold still." },
  { from: "poseRightCue", to: "poseLeftCue", step: "2", title: "Turn right", sub: "Each cheek is read from the side facing it." },
  { from: "poseLeftCue", to: "analysing", step: "3", title: "Turn left", sub: "No buttons. Just hold the pose." },
  { from: "analysing", to: "report", title: "Reading your colours, face shape and skin…" },
  { from: "report", to: "tabShape", title: "Your colour season", sub: "Plus the palette that flatters you." },
  { from: "tabShape", to: "tabSkin", title: "Your face shape", sub: "And the looks that suit it best." },
  { from: "tabSkin", to: "askChat", title: "Your skin, area by area", sub: "Hydration, texture, pores and more." },
  { from: "askChat", to: "typeQuestion", title: "Ask Vera", sub: "Lipstick shades matched to your season — straight from the catalog." },
  { from: "typeQuestion", to: "end", title: "Ask anything", sub: "Real products and real prices, in seconds." },
];

/** Glass callouts that pop over the phone at key moments. */
const CALLOUTS: { at: keyof typeof M; until: keyof typeof M; text: string; side: "left" | "right"; top: number }[] = [
  { at: "openWidget", until: "scanGuide", text: "AI beauty advisor", side: "left", top: 1130 },
  { at: "poseFrontSaved", until: "analysing", text: "Auto-capture", side: "right", top: 760 },
  { at: "report", until: "tabShape", text: "Colour season", side: "left", top: 560 },
  { at: "tabShape", until: "tabSkin", text: "Face shape", side: "right", top: 700 },
  { at: "tabSkin", until: "askChat", text: "Skin score", side: "left", top: 620 },
  { at: "lipCards", until: "typeQuestion", text: "Matched to your season", side: "right", top: 1180 },
  { at: "serumCards", until: "end", text: "Real catalog · real prices", side: "left", top: 1180 },
];

const PHONE_W = 836;
const PHONE_H = Math.round((PHONE_W * 1920) / 1080);
const PHONE_TOP = 330;

export const DEMO_DURATION = sec(marks.duration);

export function Demo({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 16 } });
  const progress = interpolate(frame, [0, duration], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneFade duration={duration} fadeIn={14}>
      <Backdrop image="images/dashboard-bg.jpg" blur={10} />

      {/* Phone */}
      <div
        style={{
          ...glassPanel,
          position: "absolute",
          left: (1080 - PHONE_W) / 2 - 16,
          top: PHONE_TOP - 16,
          width: PHONE_W + 32,
          height: PHONE_H + 32,
          borderRadius: 84,
          padding: 16,
          transform: `translateY(${(1 - rise) * 160}px)`,
        }}
      >
        <div style={{ width: PHONE_W, height: PHONE_H, borderRadius: 68, overflow: "hidden", background: "#fff" }}>
          <OffthreadVideo src={staticFile("clips/demo.mp4")} muted style={{ width: "100%", height: "100%" }} />
        </div>
      </div>

      {/* Captions */}
      {CAPTIONS.map((c) => (
        <Sequence key={c.title} from={sec(M[c.from])} durationInFrames={Math.max(1, sec(M[c.to]) - sec(M[c.from]))} layout="none">
          <Caption title={c.title} sub={c.sub} step={c.step} />
        </Sequence>
      ))}

      {/* Callouts */}
      {CALLOUTS.map((c) => (
        <PopIn key={c.text} at={sec(M[c.at]) + 8} until={sec(M[c.until])} style={{ top: c.top, [c.side]: 26 }}>
          <Chip style={{ fontSize: 32 }}>{c.text}</Chip>
        </PopIn>
      ))}

      {/* AI face disclosure during the scan + results */}
      <Sequence from={sec(M.scanStart)} durationInFrames={sec(M.askChat) - sec(M.scanStart)} layout="none">
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 26 }}>
          <div style={{ fontSize: 24, color: C.muted, background: "rgba(255,255,255,0.7)", borderRadius: 999, padding: "8px 20px" }}>Demo face is AI-generated</div>
        </AbsoluteFill>
      </Sequence>

      {/* Progress bar */}
      <div style={{ position: "absolute", left: 120, right: 120, top: 292, height: 6, borderRadius: 6, background: "rgba(255,255,255,0.6)" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 6, background: C.pink }} />
      </div>
    </SceneFade>
  );
}

function Caption({ title, sub, step }: { title: string; sub?: string; step?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 15, mass: 0.6 } });
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 70, display: "flex", gap: 26, alignItems: "center", opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      {step && (
        <div style={{ flex: "none", width: 112, height: 112, borderRadius: 34, background: C.pink, color: "#fff", fontSize: 64, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 18px 36px -12px rgba(210,98,135,0.8)" }}>
          {step}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: step ? 66 : 58, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.08, color: C.ink }}>{title}</div>
        {sub && <div style={{ fontSize: 32, color: C.muted, marginTop: 10, lineHeight: 1.3 }}>{sub}</div>}
      </div>
    </div>
  );
}
