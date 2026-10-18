# AI Beauty Advisor — promo video (Remotion)

A silent, captioned 9:16 promo (1080×1920, 30fps, ~2:08) for the 3-pose skin
scan and the AI chat. Every app screen in it is a real Playwright recording of
the RUPA demo store (`apps/web/public/demo-retailer.html`) with the widget in
English — nothing is mocked. The scan is fed by an AI-generated face clip used
as Chrome's fake camera (the video says so on screen).

## Pipeline

```bash
npm install
npm run camera -- ~/Downloads/<face-turning-video>.mp4   # → .camera/face-cam.y4m
npm run record                                          # → .recording/demo.mp4 + demo-marks.json
npm run assets                                          # → public/ (gitignored) + src/demo-marks.json
npm run studio                                          # preview
npm run render                                          # → out/ai-beauty-advisor-promo.mp4
```

`npm run record` needs the web app on `BASE_URL` (default `http://localhost:3002`)
with matching-service, skin-scanning and ai-advisor running, and uses the
installed Google Chrome.

- **Fake camera** (`scripts/make-fake-camera.sh`): front → right turn → back →
  left turn (the right turn, mirrored) → back, looped; a face-centred gain
  evens out side lighting so the scan's front-photo light check passes.
- **Recording** (`scripts/record-demo.mjs`): CDP screencast frames re-timed to
  30fps; it logs the second of every story beat (pose saved, report shown,
  cards shown…) into `demo-marks.json`, which the captions in
  `src/scenes/Demo.tsx` are timed to — re-recording re-syncs them.
- **Scenes** (`src/scenes/`): Hook → Demo (the recording in a glass phone with
  captions and callouts) → Retailers (snippet + dashboard shots, demo data)
  → Outro. Theme tokens match the app's glassmorphism (`src/theme.ts`).

## 16:9 GlowOps promo (with and without voice-over)

A 1920×1080, ~3:33 cut around the three pillars: intro → Personalized Beauty
Advisor (the same shopper recording, in a phone) → Sales Intelligence → Forecasting
& Demand Signal (a dashboard recording) → outro. Captioned throughout; one render
adds an ElevenLabs voice-over (voice "Jessica"), the other is silent.

```bash
npm run record          # shopper flow, as above
npm run record:admin    # → .recording/admin.mp4 + admin-marks.json (ADMIN_PASSWORD from ../web/.env.local)
npm run voice           # → public/voice/*.mp3 + src/wide/voice-durations.json (ELEVENLABS_API_KEY in .env)
npm run assets
npm run render:wide         # → out/glowops-promo-16x9.mp4
npm run render:wide-silent  # → out/glowops-promo-16x9-silent.mp4
```

- **Dashboard recording** (`scripts/record-admin.mjs`): logs in, types the 9.9
  and 11.11 questions into Sales Intelligence and waits for Gemini's real
  answers (ai-advisor needs Gemini credentials; it fails loudly instead of
  recording the "couldn't be reached" card), then walks Forecasting. It needs
  `data/22_demo_sales.sql` applied. Two things are staged in the
  `/api/admin/events/analytics` response only: the timeline keeps just the
  8.8 → 9.9 → 10.10 → 11.11 story, and those promo codes get sample session
  counts (the video labels them as sample figures).
- **Voice-over** (`src/wide/voice-lines.json` → `scripts/make-voice.mjs`): one
  take per line, regenerated only when its text changes. Each line is placed on
  a recording beat in `src/wide/timeline.ts`, which also cuts Gemini's waiting
  time out of the dashboard clip; the studio console warns if a line would run
  into the next one after a re-record.

Remotion is free for individuals and companies of up to 3 people; larger teams
need a [company license](https://www.remotion.dev/license).
