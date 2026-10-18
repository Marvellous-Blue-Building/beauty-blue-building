import { Composition } from "remotion";
import { Promo, PROMO_DURATION } from "./Promo";
import { FPS, H, W } from "./theme";

export function Root() {
  return <Composition id="Promo" component={Promo} durationInFrames={PROMO_DURATION} fps={FPS} width={W} height={H} />;
}
