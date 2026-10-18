import adminMarks from "../admin-marks.json";
import demoMarks from "../demo-marks.json";
import { FPS } from "../theme";
import durations from "./voice-durations.json";

/** Everything the 16:9 cut times itself by: the two recordings' beat marks
 * (src/demo-marks.json, src/admin-marks.json) and the voice takes' lengths
 * (src/wide/voice-durations.json). All values are seconds unless named *Frames. */

export const WW = 1920;
export const WH = 1080;
export const f = (s: number) => Math.round(s * FPS);

export type VoiceId = keyof typeof durations;
export const voiceLength = (id: VoiceId) => durations[id].seconds;

export interface Cue {
  voice: VoiceId;
  /** Seconds from the start of the scene. */
  at: number;
}

const D = demoMarks.marks;
const A = adminMarks.marks;

// ---- Intro / outro: fixed lengths around their lines.
export const INTRO_CUES: Cue[] = [
  { voice: "i1", at: 0.6 },
  { voice: "i2", at: 0.6 + voiceLength("i1") + 0.5 },
];
export const INTRO = INTRO_CUES[1].at + voiceLength("i2") + 1.2;

export const OUTRO_CUES: Cue[] = [
  { voice: "o1", at: 0.8 },
  { voice: "o2", at: 0.8 + voiceLength("o1") + 0.6 },
];
export const OUTRO = OUTRO_CUES[1].at + voiceLength("o2") + 2.6;

// ---- Pillar 1: the shopper recording plays straight through.
export const ADVISOR = demoMarks.duration;
export const ADVISOR_CUES: Cue[] = [
  { voice: "a_store", at: D.store + 0.6 },
  { voice: "a_open", at: D.openWidget + 0.2 },
  { voice: "a_guide", at: D.scanGuide + 0.4 },
  { voice: "a_poses", at: D.poseFrontCue + 0.3 },
  { voice: "a_analyse", at: D.analysing + 0.2 },
  { voice: "a_report", at: D.report + 0.6 },
  { voice: "a_shape", at: D.tabShape + 0.4 },
  { voice: "a_skin", at: D.tabSkin + 0.4 },
  { voice: "a_chat", at: D.askChat + 0.3 },
  { voice: "a_serum", at: D.typeQuestion + 0.3 },
];

// ---- Pillars 2 and 3: cut lists over the dashboard recording.
/** One stretch of the recording: source seconds [from, to], shown for `length`
 * seconds (longer than the source = slowed down, used only on still screens). */
export interface Cut {
  from: number;
  to: number;
  length: number;
}
const cut = (from: number, to: number, length = to - from): Cut => ({ from, to, length });

/** Output time (seconds from scene start) of a source time inside a cut list. */
export function outTime(cuts: Cut[], src: number): number {
  let acc = 0;
  for (const c of cuts) {
    if (src >= c.from && src <= c.to) return acc + ((src - c.from) / (c.to - c.from)) * c.length;
    acc += c.length;
  }
  throw new Error(`source time ${src}s is cut out`);
}
export const cutsLength = (cuts: Cut[]) => cuts.reduce((s, c) => s + c.length, 0);

// Sales Intelligence: the wait for each Gemini reply is cut down to a beat of
// "thinking…"; the 9.9 answer holds long enough for its line.
const q1Hold = Math.max(A.typeQ2 - A.answerQ1, voiceLength("s2") + 1.4);
const q2Hold = Math.min(A.openForecasting - A.answerQ2, Math.max(10, voiceLength("s3") + 4));
export const SALES_CUTS: Cut[] = [
  cut(A.overview, A.sentQ1 + 0.9),
  cut(A.answerQ1 - 0.9, A.answerQ1),
  cut(A.answerQ1, A.typeQ2, q1Hold),
  cut(A.typeQ2, A.sentQ2 + 0.9),
  cut(A.answerQ2 - 0.9, A.answerQ2 + q2Hold),
];
export const SALES = cutsLength(SALES_CUTS);
export const SALES_CUES: Cue[] = [
  { voice: "s1", at: 0.8 },
  { voice: "s2", at: outTime(SALES_CUTS, A.answerQ1) + 0.5 },
  { voice: "s3", at: outTime(SALES_CUTS, A.typeQ2) + 0.3 },
];

// Forecasting & Demand Signal: one continuous stretch.
export const FORECAST_CUTS: Cut[] = [cut(A.openForecasting, A.end)];
export const FORECAST = cutsLength(FORECAST_CUTS);
const fc = (src: number) => outTime(FORECAST_CUTS, src);
export const FORECAST_CUES: Cue[] = [
  { voice: "f1", at: fc(A.insightCard) - 1.2 },
  { voice: "f2", at: fc(A.forecastChart) + 0.3 },
  { voice: "f3", at: fc(A.planner) + 0.6 },
  { voice: "f4", at: fc(A.attribution) + 1.0 },
];

export const ADMIN_MARKS = A;
export const DEMO_MARKS = D;

/** A line that would still be talking when the next one starts. Logged by the
 * composition so a re-recorded clip with tighter beats is caught in the studio. */
export function overlaps(cues: Cue[], sceneLength: number): string[] {
  return cues.flatMap((c, i) => {
    const end = c.at + voiceLength(c.voice);
    const next = i + 1 < cues.length ? cues[i + 1].at : sceneLength;
    return end > next ? [`${c.voice} runs ${(end - next).toFixed(2)}s into ${cues[i + 1]?.voice ?? "the scene end"}`] : [];
  });
}
