import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Chip, LogoMark, PopIn, SceneFade, useSpringIn } from "../components";
import { C, glassPanel } from "../theme";

export function Outro({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const card = useSpringIn(0, 15);
  const glow = interpolate(frame % 60, [0, 30, 60], [0.55, 0.95, 0.55]);
  return (
    <SceneFade duration={duration} fadeOut={20}>
      <Backdrop image="images/login-bg.jpg" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
        <div style={{ ...glassPanel, width: "100%", borderRadius: 64, padding: "100px 70px", textAlign: "center", opacity: card, transform: `scale(${0.92 + 0.08 * card})` }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LogoMark size={150} />
          </div>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -2.5, color: C.ink, marginTop: 50, lineHeight: 1.05 }}>AI Beauty Advisor</div>
          <div style={{ fontSize: 38, color: C.muted, marginTop: 22, lineHeight: 1.35 }}>A 3-pose skin scan and an AI advisor that knows your catalog.</div>
          <div
            style={{
              display: "inline-block",
              marginTop: 60,
              background: C.pink,
              color: "#fff",
              fontSize: 40,
              fontWeight: 600,
              borderRadius: 999,
              padding: "30px 64px",
              boxShadow: `0 24px 50px -16px rgba(210,98,135,${glow})`,
            }}
          >
            Try the skin scan →
          </div>
        </div>
      </AbsoluteFill>
      <PopIn at={24} style={{ left: 0, right: 0, bottom: 260, display: "flex", justifyContent: "center", gap: 18, flexWrap: "wrap", padding: "0 60px" }}>
        <Chip>Skin scan</Chip>
        <Chip>AI chat</Chip>
        <Chip>One line of code</Chip>
      </PopIn>
    </SceneFade>
  );
}
