import { AbsoluteFill, Series } from "remotion";
import { C, FPS } from "../theme";
import { ADVISOR, ADVISOR_CUES, f, FORECAST, FORECAST_CUES, INTRO, INTRO_CUES, OUTRO, OUTRO_CUES, overlaps, SALES, SALES_CUES } from "./timeline";
import { FORECAST_SCENE, SALES_SCENE, WideAdmin } from "./WideAdmin";
import { WideAdvisor } from "./WideAdvisor";
import { WideIntro } from "./WideIntro";
import { WideOutro } from "./WideOutro";

const SCENES = [
  { len: f(INTRO), cues: INTRO_CUES, name: "intro" },
  { len: f(ADVISOR), cues: ADVISOR_CUES, name: "advisor" },
  { len: f(SALES), cues: SALES_CUES, name: "sales" },
  { len: f(FORECAST), cues: FORECAST_CUES, name: "forecast" },
  { len: f(OUTRO), cues: OUTRO_CUES, name: "outro" },
];
export const WIDE_DURATION = SCENES.reduce((s, x) => s + x.len, 0);

for (const sc of SCENES) for (const o of overlaps(sc.cues, sc.len / FPS)) console.warn(`[voice] ${sc.name}: ${o}`);

/** 16:9 GlowOps promo, one scene per pillar: intro → Personalized Beauty Advisor
 * (shopper recording) → Sales Intelligence → Forecasting & Demand Signal (dashboard
 * recording) → outro. Captioned throughout; `voice` adds the ElevenLabs voice-over. */
export function GlowOpsWide({ voice }: { voice: boolean }) {
  const [intro, advisor, sales, forecast, outro] = SCENES.map((s) => s.len);
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Series>
        <Series.Sequence durationInFrames={intro}>
          <WideIntro duration={intro} voice={voice} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={advisor}>
          <WideAdvisor duration={advisor} voice={voice} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={sales}>
          <WideAdmin scene={SALES_SCENE} duration={sales} voice={voice} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={forecast}>
          <WideAdmin scene={FORECAST_SCENE} duration={forecast} voice={voice} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={outro}>
          <WideOutro duration={outro} voice={voice} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
