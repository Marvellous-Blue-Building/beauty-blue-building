import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Chip, LogoMark, PopIn, SceneFade, useSpringIn } from "../components";
import { C, glassPanel } from "../theme";
import { OUTRO_CUES, f } from "./timeline";
import { VoiceTrack } from "./parts";
import { PILLARS } from "./WideIntro";

export function WideOutro({ duration, voice }: { duration: number; voice: boolean }) {
  const frame = useCurrentFrame();
  const card = useSpringIn(0, 15);
  const glow = interpolate(frame % 60, [0, 30, 60], [0.55, 0.95, 0.55]);
  const tagline = f(OUTRO_CUES[1].at);
  return (
    <SceneFade duration={duration} fadeOut={24}>
      <Backdrop image="images/login-bg.jpg" />
      <VoiceTrack cues={OUTRO_CUES} voice={voice} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...glassPanel, width: 1240, borderRadius: 60, padding: "72px 80px 78px", textAlign: "center", opacity: card, transform: `scale(${0.92 + 0.08 * card})` }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LogoMark size={128} />
          </div>
          <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: -3, color: C.ink, marginTop: 36, lineHeight: 1 }}>GlowOps</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 40, flexWrap: "wrap" }}>
            {PILLARS.map((p, i) => (
              <PillarChip key={p.n} title={p.title} at={f(1.4) + i * 10} />
            ))}
          </div>
          {/* Fixed height so the card doesn't grow when the tagline pops in. */}
          <div style={{ position: "relative", height: 210, marginTop: 46 }}>
            <PopIn at={tagline} style={{ left: 0, right: 0, top: 0 }}>
              <div style={{ fontSize: 46, fontWeight: 700, color: C.pink, letterSpacing: -1 }}>Run your beauty brand with AI.</div>
              <div style={{ display: "inline-block", marginTop: 34, background: C.pink, color: "#fff", fontSize: 32, fontWeight: 600, borderRadius: 999, padding: "24px 56px", boxShadow: `0 24px 50px -16px rgba(210,98,135,${glow})` }}>
                Get started with GlowOps →
              </div>
            </PopIn>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

/** Always laid out (so the row doesn't reflow), fading and rising in at `at`. */
function PillarChip({ title, at }: { title: string; at: number }) {
  const p = useSpringIn(at, 13);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      <Chip style={{ fontSize: 28, padding: "14px 26px" }}>{title}</Chip>
    </div>
  );
}
