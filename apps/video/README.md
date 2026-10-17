# AI Beauty Adviser — promo video (Remotion)

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
npm run render                                          # → out/ai-beauty-adviser-promo.mp4
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

Remotion is free for individuals and companies of up to 3 people; larger teams
need a [company license](https://www.remotion.dev/license).
