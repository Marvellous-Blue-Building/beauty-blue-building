/**
 * Voice-over for the 16:9 promo: one ElevenLabs take per line in
 * src/wide/voice-lines.json → public/voice/<id>.mp3 (gitignored), and each
 * take's length → src/wide/voice-durations.json (committed, so the scene timing
 * the composition derives from it stays reproducible).
 * A line is only re-generated when its text, voice or model changed.
 *
 * usage: npm run voice   (ELEVENLABS_API_KEY in apps/video/.env)
 */
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY not set (apps/video/.env)");

const { voice, lines } = JSON.parse(readFileSync(join(ROOT, "src/wide/voice-lines.json"), "utf8"));
const outDir = join(ROOT, "public/voice");
mkdirSync(outDir, { recursive: true });
const durationsPath = join(ROOT, "src/wide/voice-durations.json");
const previous = existsSync(durationsPath) ? JSON.parse(readFileSync(durationsPath, "utf8")) : {};
const SETTINGS = { stability: 0.38, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true };

const durations = {};
for (const line of lines) {
  const hash = createHash("sha1").update(JSON.stringify([line.text, voice.id, voice.model, SETTINGS])).digest("hex").slice(0, 12);
  const file = join(outDir, `${line.id}.mp3`);
  if (previous[line.id]?.hash !== hash || !existsSync(file)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: line.text, model_id: voice.model, voice_settings: SETTINGS }),
    });
    if (!res.ok) throw new Error(`${line.id}: ElevenLabs ${res.status} ${await res.text()}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log("generated", line.id);
  }
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
  durations[line.id] = { seconds: Math.round(seconds * 1000) / 1000, hash };
}
writeFileSync(durationsPath, JSON.stringify(durations, null, 2) + "\n");
console.log(Object.entries(durations).map(([id, d]) => `${id} ${d.seconds.toFixed(2)}s`).join("\n"));
