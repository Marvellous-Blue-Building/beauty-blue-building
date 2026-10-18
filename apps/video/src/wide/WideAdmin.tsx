import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, SceneFade } from "../components";
import { C, glassPanel } from "../theme";
import { ADMIN_MARKS as A, FORECAST_CUES, FORECAST_CUTS, SALES, SALES_CUES, SALES_CUTS, type Cue, type Cut, outTime, WH, WW } from "./timeline";
import { Camera, type Caption, Captions, ChapterTag, CutClip, type Shot, VoiceTrack } from "./parts";

// The 1920x1080 dashboard recording, shown at 76% in a glass frame.
const K = 0.76;
const FW = Math.round(WW * K);
const FH = Math.round(WH * K);
const FL = (WW - FW) / 2;
const FT = 104;

/** Zoom targets, in the recording's own pixels. */
const CHAT = { cx: 1010, cy: 560 };
const CHAT_LOW = { cx: 1010, cy: 700 };
// The first answer sits alone at the top of the chat.
const CHAT_HIGH = { cx: 1010, cy: 440 };
const INSIGHT_CARD = { cx: 1098, cy: 345 };
const EVENT_DETAIL = { cx: 1098, cy: 860 };
const ATTRIBUTION = { cx: 1098, cy: 650 };
const WIDE = { cx: WW / 2, cy: WH / 2 };

interface AdminScene {
  chapter: { n: number; label: string };
  cuts: Cut[];
  cues: Cue[];
  captions: Caption[];
  shots: Shot[];
  footnote: string;
}

const s = (src: number) => outTime(SALES_CUTS, src);
export const SALES_SCENE: AdminScene = {
  chapter: { n: 2, label: "Sales Intelligence" },
  cuts: SALES_CUTS,
  cues: SALES_CUES,
  captions: [
    { from: 0.4, to: s(A.answerQ1), title: "Ask about your sales", sub: "In plain language, right inside the GlowOps dashboard." },
    { from: s(A.answerQ1), to: s(A.typeQ2), title: "The real cause, from your data", sub: "9.9: ad budget cut 60% vs 8.8, so 23 units sold instead of 87." },
    { from: s(A.typeQ2), to: SALES, title: "Then, a plan for 11.11", sub: "Concrete steps, grounded in what worked at 10.10." },
  ],
  shots: [
    { at: 0, scale: 1, ...WIDE },
    { at: s(A.typeQ1), scale: 1.12, ...CHAT_LOW },
    { at: s(A.answerQ1) + 0.6, scale: 1.4, ...CHAT_HIGH },
    { at: s(A.typeQ2), scale: 1.2, ...CHAT_LOW },
    { at: s(A.answerQ2) + 0.6, scale: 1.34, ...CHAT },
  ],
  footnote: "Answers generated live by Gemini from the demo store's sales data",
};

const fc = (src: number) => outTime(FORECAST_CUTS, src);
export const FORECAST_SCENE: AdminScene = {
  chapter: { n: 3, label: "Forecasting & Demand Signal" },
  cuts: FORECAST_CUTS,
  cues: FORECAST_CUES,
  captions: [
    { from: 0.4, to: fc(A.forecastChart), title: "Today's top insight", sub: "Written by AI from your sales, events and alerts." },
    { from: fc(A.forecastChart), to: fc(A.planner), title: "Demand signal per SKU", sub: "Tracked against a forecast baseline, to catch a surge early." },
    { from: fc(A.planner), to: fc(A.attribution), title: "Event & promo planner", sub: "Every campaign on one timeline, with deadlines and results." },
    { from: fc(A.attribution), to: fc(A.end), title: "Promo-code attribution", sub: "See which campaigns actually bring shoppers in." },
  ],
  shots: [
    { at: 0, scale: 1, ...WIDE },
    { at: fc(A.insightCard) + 0.4, scale: 1.55, ...INSIGHT_CARD },
    { at: fc(A.insightCard) + 6.8, scale: 1.55, ...INSIGHT_CARD },
    { at: fc(A.forecastChart) + 0.8, scale: 1.06, ...WIDE },
    { at: fc(A.eventDetail) + 2.4, scale: 1.06, ...WIDE },
    { at: fc(A.eventDetail) + 3.6, scale: 1.4, ...EVENT_DETAIL },
    { at: fc(A.attribution) + 0.4, scale: 1.06, ...WIDE },
    { at: fc(A.attribution) + 4.4, scale: 1.06, ...WIDE },
    { at: fc(A.attribution) + 5.6, scale: 1.5, ...ATTRIBUTION },
  ],
  footnote: "Demo store data · promo-code session counts are sample figures",
};

export function WideAdmin({ scene, duration, voice }: { scene: AdminScene; duration: number; voice: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 16 } });
  return (
    <SceneFade duration={duration} fadeIn={14}>
      <Backdrop image="images/dashboard-bg.jpg" blur={12} />
      <VoiceTrack cues={scene.cues} voice={voice} />

      <div style={{ ...glassPanel, position: "absolute", left: FL - 12, top: FT - 12, width: FW + 24, height: FH + 24, borderRadius: 34, padding: 12, transform: `translateY(${(1 - rise) * 90}px)` }}>
        <div style={{ position: "relative", width: FW, height: FH, borderRadius: 24, overflow: "hidden", background: C.cream }}>
          <Camera shots={scene.shots.map((sh) => ({ ...sh, cx: sh.cx * K, cy: sh.cy * K }))} width={FW} height={FH}>
            {/* The clip is laid out at frame size; Camera's scale is relative to that. */}
            <AbsoluteFill style={{ width: FW, height: FH }}>
              <CutClip src="clips/admin.mp4" cuts={scene.cuts} />
            </AbsoluteFill>
          </Camera>
        </div>
      </div>

      <ChapterTag n={scene.chapter.n} label={scene.chapter.label} style={{ left: FL, top: 26 }} />
      <Captions items={scene.captions} style={{ left: FL, right: FL, top: FT + FH + 26 }} align="center" titleSize={40} />
      <div style={{ position: "absolute", right: FL, top: 40, fontSize: 18, color: C.muted, background: "rgba(255,255,255,0.65)", borderRadius: 999, padding: "6px 16px" }}>{scene.footnote}</div>
    </SceneFade>
  );
}
