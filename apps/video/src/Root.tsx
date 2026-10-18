import { Composition } from "remotion";
import { Promo, PROMO_DURATION } from "./Promo";
import { FPS, H, W } from "./theme";
import { GlowOpsWide, WIDE_DURATION } from "./wide/GlowOpsWide";
import { WH, WW } from "./wide/timeline";

export function Root() {
  return (
    <>
      <Composition id="Promo" component={Promo} durationInFrames={PROMO_DURATION} fps={FPS} width={W} height={H} />
      <Composition id="GlowOpsWide" component={GlowOpsWide} durationInFrames={WIDE_DURATION} fps={FPS} width={WW} height={WH} defaultProps={{ voice: true }} />
      <Composition id="GlowOpsWideSilent" component={GlowOpsWide} durationInFrames={WIDE_DURATION} fps={FPS} width={WW} height={WH} defaultProps={{ voice: false }} />
    </>
  );
}
