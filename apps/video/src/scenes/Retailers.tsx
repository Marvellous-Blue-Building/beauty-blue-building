import { Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, PopIn, SceneFade } from "../components";
import { C, glassPanel, sec } from "../theme";

const SNIPPET = '<script src="https://your-store.com/widget-loader.js" async></script>';

const SHOTS = [
  { image: "images/admin-overview.jpg", title: "One dashboard for your store", sub: "Conversations, skin scans and shoppers at a glance.", at: sec(4.5) },
  { image: "images/admin-forecasting.jpg", title: "Spot demand early", sub: "Demand signals from real chats and carts.", at: sec(9.2) },
  { image: "images/admin-conversations.jpg", title: "Every conversation", sub: "See exactly what shoppers ask Vera.", at: sec(13.6) },
];

export function Retailers({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const typed = Math.round(interpolate(frame, [sec(0.8), sec(3.4)], [0, SNIPPET.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = Math.floor(frame / 15) % 2 === 0;
  return (
    <SceneFade duration={duration}>
      <Backdrop image="images/login-bg.jpg" blur={6} />
      <PopIn at={0} style={{ left: 70, right: 70, top: 120 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: C.pinkStrong }}>For beauty retailers</div>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05, color: C.ink, marginTop: 14 }}>Add Vera to your store with one line.</div>
      </PopIn>

      <PopIn at={sec(0.4)} style={{ left: 70, right: 70, top: 470 }}>
        <div style={{ ...glassPanel, borderRadius: 40, padding: 30 }}>
          <div style={{ fontSize: 26, color: C.muted, marginBottom: 16 }}>Paste before &lt;/body&gt;</div>
          <div style={{ background: "#404040", borderRadius: 24, padding: "30px 32px", fontFamily: "SF Mono, Menlo, monospace", fontSize: 30, lineHeight: 1.5, color: "#f5f5f5", wordBreak: "break-all", minHeight: 182 }}>
            {SNIPPET.slice(0, typed)}
            <span style={{ opacity: caret ? 1 : 0, color: C.pink }}>▍</span>
          </div>
        </div>
      </PopIn>

      {SHOTS.map((s, i) => (
        <Sequence key={s.image} from={s.at} durationInFrames={(SHOTS[i + 1]?.at ?? duration) - s.at} layout="none">
          <Shot image={s.image} title={s.title} sub={s.sub} />
        </Sequence>
      ))}

      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", fontSize: 24, color: C.muted }}>Dashboard screenshots use demo data.</div>
    </SceneFade>
  );
}

function Shot({ image, title, sub }: { image: string; title: string; sub: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 15 } });
  const zoom = interpolate(frame, [0, sec(4.6)], [1.0, 1.12], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top: 860, opacity: p, transform: `translateX(${(1 - p) * 120}px)` }}>
      <div style={{ ...glassPanel, borderRadius: 40, padding: 14 }}>
        <div style={{ display: "flex", gap: 10, padding: "8px 14px 16px" }}>
          {["#efc5b9", "#dbcfc3", "#d3e3d6"].map((c) => (
            <span key={c} style={{ width: 18, height: 18, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{ borderRadius: 28, overflow: "hidden", height: 560 }}>
          <Img src={staticFile(image)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left top", transform: `scale(${zoom})`, transformOrigin: "30% 20%" }} />
        </div>
      </div>
      <div style={{ marginTop: 40, paddingLeft: 10 }}>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.2, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 32, color: C.muted, marginTop: 8 }}>{sub}</div>
      </div>
    </div>
  );
}
