import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Chip, LogoMark, PopIn, SceneFade, useSpringIn } from "../components";
import { C, glassPanel } from "../theme";

const WORDS = [
  { text: "Your skin,", at: 14 },
  { text: "decoded", at: 26, accent: true },
  { text: "in three poses.", at: 38 },
];

export function Hook({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const logo = useSpringIn(0, 12);
  const card = useSpringIn(4, 16);
  const underline = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <SceneFade duration={duration} fadeIn={0}>
      <Backdrop image="images/login-bg.jpg" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
        <div
          style={{
            ...glassPanel,
            width: "100%",
            borderRadius: 64,
            padding: "90px 70px 80px",
            transform: `translateY(${(1 - card) * 80}px)`,
            opacity: card,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${0.85 + 0.15 * logo})`, transformOrigin: "left center" }}>
            <LogoMark size={104} />
            <div>
              <div style={{ fontSize: 44, fontWeight: 700, color: C.ink, letterSpacing: -0.5 }}>AI Beauty Advisor</div>
              <div style={{ fontSize: 28, color: C.muted, marginTop: 4 }}>Skin scan + AI advisor for beauty stores</div>
            </div>
          </div>
          <div style={{ marginTop: 80 }}>
            {WORDS.map((w) => (
              <Word key={w.text} {...w} />
            ))}
          </div>
          <div style={{ height: 10, width: `${underline * 62}%`, background: C.pink, borderRadius: 10, marginTop: 26, boxShadow: "0 10px 24px -8px rgba(210,98,135,0.8)" }} />
        </div>
      </AbsoluteFill>
      <PopIn at={78} style={{ left: 0, right: 0, bottom: 300, display: "flex", justifyContent: "center", gap: 18 }}>
        <Chip>Colour season</Chip>
        <Chip>Face shape</Chip>
        <Chip>Skin type</Chip>
      </PopIn>
    </SceneFade>
  );
}

function Word({ text, at, accent }: { text: string; at: number; accent?: boolean }) {
  const p = useSpringIn(at, 13);
  return (
    <div
      style={{
        fontSize: 116,
        lineHeight: 1.04,
        fontWeight: 700,
        letterSpacing: -3,
        color: accent ? C.pink : C.ink,
        opacity: p,
        transform: `translateY(${(1 - p) * 50}px)`,
      }}
    >
      {text}
    </div>
  );
}
