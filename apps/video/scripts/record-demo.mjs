/**
 * Records the vertical (9:16) demo flow on the RUPA demo store: store → widget →
 * 3-pose scan (fake camera from the AI-generated face clip) → report → AI chat.
 * Frames come from a CDP screencast (sharper than Playwright's recordVideo) and
 * are re-timed into .recording/demo.mp4 (1080x1920, 30fps); .recording/demo-marks.json
 * holds the seconds of each story beat, which the Remotion captions sync to.
 *
 * Needs the web app on BASE_URL (default http://localhost:3002) with matching-service,
 * skin-scanning and ai-advisor running, and .camera/face-cam.y4m from `npm run camera`.
 * Uses the installed Google Chrome (`channel: "chrome"`).
 *
 * usage: npm run record
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3002";
const out = join(ROOT, ".recording");
const cam = join(ROOT, ".camera", "face-cam.y4m");
const framesDir = join(out, "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cam}`],
});
const ctx = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, permissions: ["camera"] });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const sleep = (ms) => page.waitForTimeout(ms);
const W = () => page.locator("#bw-widget-host");

await page.goto(`${BASE_URL}/demo-retailer.html`, { waitUntil: "networkidle" });
// Warm every lazy image so nothing pops in on camera.
await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); });
await sleep(1500);

// ---- screencast
const cdp = await ctx.newCDPSession(page);
const frames = [];
let t0 = null;
cdp.on("Page.screencastFrame", async (f) => {
  const ts = f.metadata.timestamp;
  if (t0 === null) t0 = ts;
  const file = join(framesDir, `f${String(frames.length).padStart(6, "0")}.jpg`);
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, t: ts - t0 });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
const startWall = Date.now();
const marks = {};
const mark = (name) => { marks[name] = (Date.now() - startWall) / 1000; console.log("mark", name, marks[name].toFixed(1)); };

async function smoothScroll(selector, to, ms) {
  await page.evaluate(async ({ selector, to, ms }) => {
    const el = selector === "window" ? document.scrollingElement : document.querySelector("#bw-widget-host").shadowRoot.querySelector(selector);
    if (!el) return;
    const from = el.scrollTop, target = to === "bottom" ? el.scrollHeight - el.clientHeight : to, start = performance.now();
    await new Promise((resolve) => {
      function step(now) {
        const k = Math.min(1, (now - start) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        el.scrollTop = from + (target - from) * e;
        k < 1 ? requestAnimationFrame(step) : resolve();
      }
      requestAnimationFrame(step);
    });
  }, { selector, to, ms });
}
async function swipeRow(selector, index, ms) {
  await page.evaluate(async ({ selector, index, ms }) => {
    const rows = document.querySelector("#bw-widget-host").shadowRoot.querySelectorAll(selector);
    const el = rows[index < 0 ? rows.length + index : index];
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth, start = performance.now();
    el.style.scrollSnapType = "none";
    await new Promise((resolve) => {
      function step(now) {
        const k = Math.min(1, (now - start) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        el.scrollLeft = max * (k < 0.6 ? e / 0.6 * 0.6 : 0.6 + (1 - 0.6) * ((k - 0.6) / 0.4)) * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
        k < 1 ? requestAnimationFrame(step) : resolve();
      }
      requestAnimationFrame(step);
    });
    el.style.scrollSnapType = "";
  }, { selector, index, ms });
}
const cue = () => page.evaluate(() => document.querySelector("#bw-widget-host").shadowRoot.querySelector(".bw-cue")?.textContent ?? "");

// ---- 1. the store
mark("store");
await sleep(1800);
await smoothScroll("window", 1250, 4200);
await sleep(1600);
await smoothScroll("window", 0, 1800);
await sleep(900);

// ---- 2. open the advisor
mark("openWidget");
await page.click("[data-open-widget]");
await sleep(3200);

// ---- 3. scan guide
mark("scanGuide");
await W().locator(".bw-scanbtn").click();
await sleep(2200);
await smoothScroll(".bw-scroll", "bottom", 3800);
await sleep(1400);
await smoothScroll(".bw-scroll", 0, 1400);
await sleep(700);

// ---- 4. three poses (hands-free)
mark("scanStart");
await W().locator(".bw-actions .bw-btn-primary").click();
let saved = 0;
const poseNames = ["poseFront", "poseRight", "poseLeft"];
mark("poseFrontCue");
while (saved < 3) {
  const steps = await page.evaluate(() => [...document.querySelector("#bw-widget-host").shadowRoot.querySelectorAll(".bw-progress .s")].filter((s) => s.classList.contains("done")).length);
  if (steps > saved) { mark(poseNames[saved] + "Saved"); saved = steps; if (saved < 3) mark(poseNames[saved] + "Cue"); }
  if (Date.now() - startWall > 240000) throw new Error("scan did not finish");
  await sleep(150);
}
mark("analysing");
await W().locator(".bw-rhero").waitFor({ timeout: 90000 });
mark("report");
await sleep(3800);
await smoothScroll(".bw-scroll", 520, 2600);
await sleep(3200);
await smoothScroll(".bw-scroll", 0, 1400);

// ---- 5. report tabs
mark("tabShape");
await W().locator(".bw-tiles button").nth(1).click();
await sleep(1500);
await smoothScroll(".bw-scroll", 560, 3000);
await sleep(2600);
await smoothScroll(".bw-scroll", 0, 1200);
mark("tabSkin");
await W().locator(".bw-tiles button").nth(2).click();
await sleep(1500);
await smoothScroll(".bw-scroll", "bottom", 4200);
await sleep(2600);

// ---- 6. chat: scan-grounded shades, then a free question
mark("askChat");
await W().locator(".bw-actions .bw-btn-primary").click();
await sleep(2600);
mark("chipLipstick");
await W().locator(".bw-chips button", { hasText: "Which lipstick" }).click();
await W().locator(".bw-pcard").first().waitFor({ timeout: 90000 });
mark("lipCards");
await sleep(2600);
await swipeRow(".bw-prods", -1, 3600);
await sleep(1200);
mark("typeQuestion");
const input = W().locator(".bw-foot input");
await input.click();
await input.pressSequentially("I need a hydrating serum with hyaluronic acid", { delay: 55 });
await sleep(500);
await input.press("Enter");
await page.waitForFunction(() => document.querySelector("#bw-widget-host").shadowRoot.querySelectorAll(".bw-prods").length >= 2, null, { timeout: 120000 });
mark("serumCards");
await sleep(2800);
await swipeRow(".bw-prods", -1, 3800);
await sleep(2400);
mark("end");

await cdp.send("Page.stopScreencast");
await sleep(300);
await browser.close();

// ---- frames → constant 30fps mp4 (each frame held until the next one)
const total = marks.end;
const lines = [];
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].t : total;
  lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
lines.push(`file '${frames[frames.length - 1].file}'`);
writeFileSync(join(out, "frames.txt"), lines.join("\n"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(out, "frames.txt"),
  "-vf", "fps=30,scale=1080:1920:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", join(out, "demo.mp4")]);
// Screencast clock and wall clock start together; marks are wall-clock seconds from the first frame.
writeFileSync(join(out, "demo-marks.json"), JSON.stringify({ duration: total, frames: frames.length, marks }, null, 2));
console.log("frames:", frames.length, "duration:", total.toFixed(1), "s");
