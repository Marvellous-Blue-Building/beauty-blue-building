import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Chip, PopIn, SceneFade } from "../components";
import { C, glassPanel } from "../theme";
import { ADVISOR_CUES, DEMO_MARKS as M, f } from "./timeline";
import { type Caption, Captions, ChapterTag, VoiceTrack } from "./parts";

type Mark = keyof typeof M;
const span = (from: Mark, to: Mark, title: string, sub?: string): Caption => ({ from: M[from], to: M[to], title, sub });

const CAPTIONS: Caption[] = [
  span("store", "openWidget", "RUPA, a demo beauty store", "One line of code adds the GlowOps beauty advisor."),
  span("openWidget", "scanGuide", "Meet Vera", "The store's AI beauty advisor."),
  span("scanGuide", "poseFrontCue", "Tap Scan", "A quick 3-pose face scan. No app to install."),
  span("poseFrontCue", "poseRightCue", "1. Face the camera", "Each photo is taken hands-free."),
  span("poseRightCue", "poseLeftCue", "2. Turn right", "It snaps the moment the pose is right."),
  span("poseLeftCue", "analysing", "3. Turn left", "No buttons. Just hold the pose."),
  span("analysing", "report", "Reading colours, face shape and skin…"),
  span("report", "tabShape", "Her colour season", "With the palette that flatters her."),
  span("tabShape", "tabSkin", "Her face shape", "And the makeup looks that suit it best."),
  span("tabSkin", "askChat", "Skin, area by area", "Hydration, texture, pores and more."),
  span("askChat", "typeQuestion", "Ask for a lipstick", "Real shades from the catalog, matched to her season."),
  span("typeQuestion", "end", "Ask anything", "Real products and real prices, in seconds."),
];

const CALLOUTS: { at: Mark; until: Mark; text: string; top: number }[] = [
  { at: "openWidget", until: "scanGuide", text: "AI beauty advisor", top: 300 },
  { at: "poseFrontSaved", until: "analysing", text: "Auto-capture", top: 520 },
  { at: "report", until: "tabShape", text: "Colour season", top: 240 },
  { at: "tabShape", until: "tabSkin", text: "Face shape", top: 420 },
  { at: "tabSkin", until: "askChat", text: "Skin score", top: 360 },
  { at: "lipCards", until: "typeQuestion", text: "Matched to her season", top: 600 },
  { at: "serumCards", until: "end", text: "Real catalog · real prices", top: 600 },
];

// The 9:16 recording in a glass phone on the right.
const PHONE_H = 940;
const PHONE_W = Math.round((PHONE_H * 1080) / 1920);
const PHONE_LEFT = 1920 - PHONE_W - 230;
const PHONE_TOP = (1080 - PHONE_H) / 2;

export function WideAdvisor({ duration, voice }: { duration: number; voice: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 16 } });
  return (
    <SceneFade duration={duration} fadeIn={14}>
      <Backdrop image="images/dashboard-bg.jpg" blur={10} />
      <VoiceTrack cues={ADVISOR_CUES} voice={voice} />

      <div style={{ ...glassPanel, position: "absolute", left: PHONE_LEFT - 14, top: PHONE_TOP - 14, width: PHONE_W + 28, height: PHONE_H + 28, borderRadius: 70, padding: 14, transform: `translateY(${(1 - rise) * 140}px)` }}>
        <div style={{ width: PHONE_W, height: PHONE_H, borderRadius: 58, overflow: "hidden", background: "#fff" }}>
          <OffthreadVideo src={staticFile("clips/demo.mp4")} muted style={{ width: "100%", height: "100%" }} />
        </div>
      </div>

      <ChapterTag n={1} label="Personalized Beauty Advisor" style={{ left: 120, top: 90 }} />
      <Captions items={CAPTIONS} style={{ left: 120, width: PHONE_LEFT - 120 - 360, top: 380 }} titleSize={72} />
      <Stages />

      {CALLOUTS.map((c) => (
        <PopIn key={c.text} at={f(M[c.at]) + 8} until={f(M[c.until])} style={{ top: c.top, right: 1920 - PHONE_LEFT + 36 }}>
          <Chip style={{ fontSize: 28 }}>{c.text}</Chip>
        </PopIn>
      ))}

      <Sequence from={f(M.scanStart)} durationInFrames={f(M.askChat) - f(M.scanStart)} layout="none">
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: "0 0 70px 120px" }}>
          <div style={{ fontSize: 22, color: C.muted, background: "rgba(255,255,255,0.7)", borderRadius: 999, padding: "8px 20px" }}>Demo face is AI-generated</div>
        </AbsoluteFill>
      </Sequence>
    </SceneFade>
  );
}

const STAGES: { label: string; from: Mark }[] = [
  { label: "Scan", from: "scanGuide" },
  { label: "Results", from: "analysing" },
  { label: "Shop with chat", from: "askChat" },
];

/** Where the shopper is in the flow: scan → results → chat. */
function Stages() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <div style={{ position: "absolute", left: 120, top: 700, display: "flex", alignItems: "center", gap: 14 }}>
      {STAGES.map((st, i) => {
        const on = interpolate(t, [M[st.from], M[st.from] + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const next = STAGES[i + 1];
        const done = next ? interpolate(t, [M[next.from], M[next.from] + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
        const active = on * (1 - done);
        return (
          <div key={st.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ ...glassPanel, borderRadius: 999, padding: "12px 24px", fontSize: 26, fontWeight: 600, color: active > 0.5 ? "#fff" : C.ink, background: active > 0.5 ? C.pink : glassPanel.background, opacity: 0.45 + 0.55 * on, boxShadow: active > 0.5 ? "0 14px 30px -12px rgba(210,98,135,0.85)" : glassPanel.boxShadow }}>
              {st.label}
            </div>
            {next && <div style={{ width: 40, height: 3, borderRadius: 3, background: C.pink, opacity: 0.25 + 0.75 * done }} />}
          </div>
        );
      })}
    </div>
  );
}
