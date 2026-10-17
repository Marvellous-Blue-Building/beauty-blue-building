import { AbsoluteFill, Series } from "remotion";
import { Demo, DEMO_DURATION } from "./scenes/Demo";
import { Hook } from "./scenes/Hook";
import { Outro } from "./scenes/Outro";
import { Retailers } from "./scenes/Retailers";
import { C, sec } from "./theme";

export const HOOK = sec(7);
export const RETAILERS = sec(18);
export const OUTRO = sec(11);
export const PROMO_DURATION = HOOK + DEMO_DURATION + RETAILERS + OUTRO;

/** 9:16 promo: hook → real recorded demo (scan + AI chat) → for retailers → outro. Silent, captioned. */
export function Promo() {
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Series>
        <Series.Sequence durationInFrames={HOOK}>
          <Hook duration={HOOK} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={DEMO_DURATION}>
          <Demo duration={DEMO_DURATION} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={RETAILERS}>
          <Retailers duration={RETAILERS} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={OUTRO}>
          <Outro duration={OUTRO} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
