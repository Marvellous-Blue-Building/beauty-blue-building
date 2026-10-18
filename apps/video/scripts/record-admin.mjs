/**
 * Records the tenant-dashboard half of the 16:9 promo at 1920x1080:
 * Sales Intelligence (the 9.9 question, then 11.11 strategy, answered live by
 * Gemini) → Forecasting (daily insight card, demand chart, event timeline,
 * the 9.9 event detail, promo-code attribution).
 * Output: .recording/admin.mp4 (30fps) and .recording/admin-marks.json.
 *
 * Needs the web app on :3002 with ai-advisor (Gemini credentials) on :3004 and
 * data/22_demo_sales.sql applied.
 *
 * Two things are staged for the camera, both in /api/admin/events/analytics:
 * the timeline shows only the 8.8 → 9.9 → 10.10 → 11.11 double-date story,
 * and those events get sample promo-code session counts — locally there are no
 * widget sessions carrying their codes, so the attribution table would be empty.
 *
 * usage: npm run record:admin
 */
import { chromium } from "../../web/node_modules/playwright/index.mjs";
import { execFileSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".recording");
const FRAMES = join(OUT, "admin-frames");
const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) throw new Error("ADMIN_PASSWORD not set (it is read from apps/web/.env.local)");

const STORY = {
  BEAUTY88: { sessions: 148, mentions: 61 },
  PAYDAY99: { sessions: 41, mentions: 17 },
  DOUBLE1010: { sessions: 163, mentions: 70 },
  SINGLES1111: { sessions: 0, mentions: 0 },
};
const Q1 = "Why did sales during the 9.9 event decline?";
const Q2 = "What strategy should we use for 11.11?";

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "en-US" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const sleep = (ms) => page.waitForTimeout(ms);

await page.route("**/api/admin/events/analytics", async (route) => {
  const res = await route.fetch();
  const body = await res.json();
  body.events = body.events.filter((e) => e.promoCode in STORY);
  let promoSessions = 0;
  for (const e of body.events) {
    const s = STORY[e.promoCode];
    promoSessions += s.sessions;
    e.attribution = { ...s, costPerSession: e.adBudget && s.sessions ? e.adBudget / s.sessions : null };
  }
  const organik = body.attributionSummary?.organikSessions ?? 0;
  body.attributionSummary = { organikSessions: organik, totalSessions: organik + promoSessions };
  await route.fulfill({ response: res, json: body });
});

// A visible cursor (the screencast doesn't draw the OS one) that eases between points.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "rec-cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(210,98,135,.35);border:2px solid #fff;box-shadow:0 4px 14px rgba(64,40,48,.35);z-index:2147483647;pointer-events:none;transition:transform .12s;";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
});
const hideDevOverlay = () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

let cursor = { x: 960, y: 540 };
async function moveTo(locator, ms = 700) {
  const box = await locator.boundingBox();
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(to.x, to.y, { steps: Math.max(8, Math.round(ms / 16)) });
  cursor = to;
}
async function click(locator, pause = 250) {
  await locator.scrollIntoViewIfNeeded();
  await moveTo(locator);
  await sleep(pause);
  await locator.click();
}
/** Eases the nearest scrollable ancestor of `locator` so it sits `block` in view. */
async function glideTo(locator, ms = 1600, block = "center") {
  await locator.evaluate(async (el, { ms, block }) => {
    let sc = el.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    sc = sc ?? document.scrollingElement;
    const r = el.getBoundingClientRect(), sr = sc === document.scrollingElement ? { top: 0, height: innerHeight } : sc.getBoundingClientRect();
    const offset = block === "start" ? r.top - sr.top - 24 : r.top - sr.top - (sr.height - r.height) / 2;
    const from = sc.scrollTop, to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, from + offset)), t0 = performance.now();
    await new Promise((done) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        sc.scrollTop = from + (to - from) * e;
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }, { ms, block });
}

// ---- log in and warm every section (charts, Gemini daily card) before recording
await page.goto(`${BASE}/login`);
await page.fill('input[type="password"]', PASSWORD);
await page.keyboard.press("Enter");
await page.waitForURL(/\/admin$/);
await hideDevOverlay();
// The daily card is cached server-side for a day; regenerate it so it reflects today's data.
await page.request.get(`${BASE}/api/admin/insight/summary?lang=en&refresh=1`, { timeout: 90000 });
const nav = (name) => page.locator("nav button", { hasText: name }).first();
await nav("Forecasting").click();
await page.getByText("Vera Intelligence is reviewing your data...").waitFor({ state: "hidden", timeout: 90000 });
await sleep(2500);
await nav("Overview").click();
await sleep(2500);
await page.mouse.move(cursor.x, cursor.y);

// ---- screencast
const cdp = await ctx.newCDPSession(page);
const frames = [];
let t0 = null;
cdp.on("Page.screencastFrame", async (f) => {
  const ts = f.metadata.timestamp;
  if (t0 === null) t0 = ts;
  const file = join(FRAMES, `f${String(frames.length).padStart(6, "0")}.jpg`);
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, t: ts - t0 });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const startWall = Date.now();
const marks = {};
const mark = (name) => { marks[name] = (Date.now() - startWall) / 1000; console.log("mark", name, marks[name].toFixed(1)); };

// ---- 1. the dashboard
mark("overview");
await sleep(2500);
await moveTo(page.locator("main").first(), 1200);
await sleep(1500);

// ---- 2. Sales Intelligence
mark("openInsight");
await click(nav("Vera Intelligence"));
await sleep(1800);
const input = page.locator("main input").last();
async function ask(q, name) {
  await click(input);
  mark(`type${name}`);
  await input.pressSequentially(q, { delay: 42 });
  await sleep(400);
  await moveTo(page.getByRole("button", { name: "Send" }), 450);
  await page.keyboard.press("Enter");
  mark(`sent${name}`);
  const thinking = page.getByText("Vera Intelligence is thinking...");
  await thinking.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await thinking.waitFor({ state: "hidden", timeout: 90000 });
  if (await page.getByText("couldn't be reached").count()) throw new Error(`Gemini didn't answer ${name} — re-run once ai-advisor responds`);
  mark(`answer${name}`);
}
await ask(Q1, "Q1");
await sleep(9000);
await ask(Q2, "Q2");
await sleep(2500);
// Let the viewer read down the strategy answer.
await glideTo(page.locator("main .whitespace-pre-wrap").last(), 2600, "center");
await sleep(8500);

// ---- 3. Forecasting
mark("openForecasting");
await click(nav("Forecasting"));
await sleep(600);
mark("insightCard");
await moveTo(page.getByText("Today's top insight"), 900);
await sleep(7000);
mark("forecastChart");
await moveTo(page.getByText("Forecast vs Actual"), 900);
await sleep(1200);
await glideTo(page.getByText("Forecast vs Actual"), 1800, "start");
await sleep(4500);
mark("planner");
await glideTo(page.getByText("Today's top insight"), 1400, "start");
await click(page.getByRole("button", { name: "Event & Promo Planner", exact: true }));
await sleep(2800);
mark("eventDetail");
await click(page.getByRole("button", { name: /Payday Sale 9\.9/ }).first());
await sleep(900);
await glideTo(page.locator("main").getByText("Payday Sale 9.9").last(), 1600, "start");
await sleep(6000);
mark("attribution");
await glideTo(page.getByRole("button", { name: "Evaluation & Attribution", exact: true }), 1200, "center");
await click(page.getByRole("button", { name: "Evaluation & Attribution", exact: true }));
await sleep(1500);
const promoTable = page.locator("main table", { has: page.getByText("PAYDAY99") }).first();
await glideTo(promoTable, 1800, "center");
await moveTo(promoTable.getByText("PAYDAY99"), 900);
await sleep(7000);
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
writeFileSync(join(OUT, "admin-frames.txt"), lines.join("\n"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(OUT, "admin-frames.txt"),
  "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", join(OUT, "admin.mp4")]);
writeFileSync(join(OUT, "admin-marks.json"), JSON.stringify({ duration: total, frames: frames.length, marks }, null, 2));
console.log("frames:", frames.length, "duration:", total.toFixed(1), "s");
