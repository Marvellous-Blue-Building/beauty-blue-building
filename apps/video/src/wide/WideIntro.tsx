import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, LogoMark, SceneFade, useSpringIn } from "../components";
import { C, glassPanel } from "../theme";
import { INTRO_CUES, f } from "./timeline";
import { VoiceTrack } from "./parts";

export const PILLARS = [
  { n: 1, title: "Personalized Beauty Advisor", who: "For your shoppers", body: "Skin & colour analysis, then the right shades and products." },
  { n: 2, title: "Sales Intelligence", who: "For your team", body: "Ask about your sales in plain language. Get real answers." },
  { n: 3, title: "Forecasting & Demand Signal", who: "For your team", body: "Demand per SKU, an event planner and promo attribution." },
];

// When the second line names each pillar (seconds into it).
const PILLAR_AT = [2.4, 5.0, 6.4];

export function WideIntro({ duration, voice }: { duration: number; voice: boolean }) {
  const frame = useCurrentFrame();
  const logo = useSpringIn(0, 12);
  const underline = interpolate(frame, [34, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line2 = f(INTRO_CUES[1].at);
  return (
    <SceneFade duration={duration} fadeIn={0}>
      <Backdrop image="images/login-bg.jpg" />
      <VoiceTrack cues={INTRO_CUES} voice={voice} />
      <AbsoluteFill style={{ padding: "0 120px", flexDirection: "row", alignItems: "center", gap: 90 }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, transform: `scale(${0.85 + 0.15 * logo})`, transformOrigin: "left center", opacity: logo }}>
            <LogoMark size={92} />
            <div style={{ fontSize: 46, fontWeight: 700, color: C.ink, letterSpacing: -0.5 }}>GlowOps</div>
          </div>
          <div style={{ marginTop: 56 }}>
            <Word text="Your beauty brand," at={10} />
            <Word text="run by AI." at={20} accent />
          </div>
          <div style={{ height: 10, width: `${underline * 46}%`, background: C.pink, borderRadius: 10, marginTop: 24, boxShadow: "0 10px 24px -8px rgba(210,98,135,0.8)" }} />
          <Fade at={44} style={{ fontSize: 32, color: C.muted, marginTop: 34, lineHeight: 1.4, maxWidth: 760 }}>
            Three AI pillars, one platform: for the shoppers in your store and the team behind it.
          </Fade>
        </div>
        <div style={{ flex: "0 0 700px", display: "flex", flexDirection: "column", gap: 24 }}>
          {PILLARS.map((p, i) => (
            <PillarCard key={p.n} {...p} at={line2 + f(PILLAR_AT[i])} />
          ))}
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

function Word({ text, at, accent }: { text: string; at: number; accent?: boolean }) {
  const p = useSpringIn(at, 13);
  return <div style={{ fontSize: 112, lineHeight: 1.04, fontWeight: 700, letterSpacing: -3.5, color: accent ? C.pink : C.ink, opacity: p, transform: `translateY(${(1 - p) * 46}px)` }}>{text}</div>;
}

function Fade({ at, style, children }: { at: number; style: React.CSSProperties; children: React.ReactNode }) {
  const p = useSpringIn(at, 18);
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>{children}</div>;
}

function PillarCard({ n, title, who, body, at }: (typeof PILLARS)[number] & { at: number }) {
  const p = useSpringIn(at, 14);
  return (
    <div style={{ ...glassPanel, borderRadius: 34, padding: "30px 34px", display: "flex", gap: 26, alignItems: "flex-start", opacity: p, transform: `translateX(${(1 - p) * 80}px)` }}>
      <div style={{ flex: "none", width: 64, height: 64, borderRadius: 20, background: C.pink, color: "#fff", fontSize: 32, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 14px 30px -12px rgba(210,98,135,0.85)" }}>{n}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.pinkStrong }}>{who}</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: C.ink, marginTop: 6, letterSpacing: -0.6 }}>{title}</div>
        <div style={{ fontSize: 24, color: C.muted, marginTop: 8, lineHeight: 1.35 }}>{body}</div>
      </div>
    </div>
  );
}
