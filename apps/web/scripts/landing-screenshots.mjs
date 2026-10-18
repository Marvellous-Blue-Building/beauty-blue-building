/**
 * Captures the real app screens shown on the landing page into
 * public/landing/{en,id}/*.jpg. Re-run whenever the UI changes:
 *
 *   npm run screenshots:landing            (dev server on :3002, ADMIN_PASSWORD from .env.local)
 *   BASE_URL=http://localhost:3000 npm run screenshots:landing
 *
 * Only screens reachable without a Google login are captured (welcome, scan
 * intro, the embeddable widget on the demo store, and the admin dashboard).
 * Uses the locally installed Google Chrome (`channel: "chrome"`), so no
 * Playwright browser download is needed.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3002";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "landing");
const LOCALES = ["en", "id"];
// The promo video's fake camera (apps/video: `npm run camera`) — an AI-generated face turning
// through the three poses. When present, the scan shot shows the live viewfinder with it.
const FAKE_CAMERA = process.env.FAKE_CAMERA ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "video", ".camera", "face-cam.y4m");
const HAS_CAMERA = existsSync(FAKE_CAMERA);
const RIGHT_SAVED = { en: "Right side saved", id: "Sisi kanan tersimpan" }; // messages scan.capturedRight

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

// Next.js dev overlay ("N" badge) must not end up in marketing shots.
const HIDE_DEV_UI = "nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }";

const prefix = (locale) => (locale === "en" ? "" : `/${locale}`);

async function settle(page, ms = 1200) {
  await page.addStyleTag({ content: HIDE_DEV_UI }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function shot(page, locale, name, clip) {
  const dir = join(OUT, locale);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82, ...(clip ? { clip } : {}) });
  console.log("  saved", `public/landing/${locale}/${name}.jpg`);
}

async function mobileShots(browser, locale) {
  const ctx = await browser.newContext({ ...MOBILE, locale, permissions: HAS_CAMERA ? ["camera"] : [] });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}${prefix(locale)}/welcome`);
  await settle(page);
  await shot(page, locale, "mobile-welcome");

  await page.goto(`${BASE_URL}${prefix(locale)}/scan`);
  if (HAS_CAMERA) {
    // Wait until the front and right photos are taken, then until the face is back facing the
    // camera (the page's own head-turn readout under ~6°): mid-scan, face mesh and live checks
    // on it. Crop just below the viewfinder.
    await page.getByText(RIGHT_SAVED[locale]).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1600); // let the "saved" toast clear
    await page.waitForFunction(() => {
      const m = document.body.innerText.match(/(?:Head turn|Sudut toleh)\s*(-?\d+)\s*°/);
      return m && Math.abs(Number(m[1])) <= 6;
    }, null, { timeout: 30000, polling: 100 });
    await page.addStyleTag({ content: HIDE_DEV_UI });
    await shot(page, locale, "mobile-scan", { x: 0, y: 0, width: 390, height: 812 });
  } else {
    // Without a camera the viewfinder shows a "can't access camera" notice — capture only the
    // intro + 3-pose stepper above it.
    await settle(page);
    await shot(page, locale, "mobile-scan", { x: 0, y: 0, width: 390, height: 590 });
  }
  await ctx.close();
}

async function adminShots(browser, locale) {
  if (!ADMIN_PASSWORD) {
    console.warn("  ADMIN_PASSWORD not set — skipping admin shots");
    return;
  }
  const ctx = await browser.newContext({ ...DESKTOP, locale });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}${prefix(locale)}/login`);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin$/);
  await settle(page, 2500);
  await shot(page, locale, "desktop-admin-overview");

  const nav = (id) => page.locator("nav button").nth(["overview", "catalog", "marketing", "forecasting", "insight", "simulator", "integration", "conversations"].indexOf(id));
  await nav("forecasting").click();
  await settle(page, 2500);
  await shot(page, locale, "desktop-admin-forecasting");

  // Event & Promo Planner → its timeline (the default sub-view), for the landing's Forecasting section.
  await page.getByRole("button", { name: "Event & Promo Planner", exact: true }).click(); // same label in EN and ID
  await settle(page, 2000);
  // Just the timeline card: the page header above it holds the Gemini-backed daily insight,
  // which needs credentials this capture may not have.
  const timeline = page.locator("main .glass-card", { has: page.locator(".relative.h-9") }).first();
  mkdirSync(join(OUT, locale), { recursive: true });
  await timeline.screenshot({ path: join(OUT, locale, "desktop-admin-events.jpg"), type: "jpeg", quality: 82 });
  console.log("  saved", `public/landing/${locale}/desktop-admin-events.jpg`);

  await nav("insight").click();
  await settle(page, 1000);
  const suggestion = locale === "en" ? "Why did sales during the 9.9 event decline?" : "Kenapa penjualan di event 9.9 menurun?";
  await page.getByRole("button", { name: suggestion }).click();
  const thinking = locale === "en" ? "Vera Intelligence is thinking..." : "Vera Intelligence sedang berpikir...";
  await page.getByText(thinking).waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await page.getByText(thinking).waitFor({ state: "hidden", timeout: 45000 }).catch(() => {});
  await settle(page, 1000);
  await shot(page, locale, "desktop-admin-insight");

  await nav("conversations").click();
  await settle(page, 1500);
  // Open the busiest session so the transcript pane isn't empty.
  await page.locator("main .glass-card button").first().click();
  await settle(page, 2000);
  await shot(page, locale, "desktop-admin-conversations");
  await ctx.close();
}

async function widgetShot(browser) {
  // demo-retailer.html is a static English sample store (the widget follows its <html lang>) —
  // captured once, used by both locales.
  const ctx = await browser.newContext({ ...DESKTOP, locale: "en" });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/demo-retailer.html`);
  await settle(page);
  await page.click(".bw-launcher");
  await page.waitForTimeout(800);
  const input = page.locator("#bw-widget-host").locator("input, textarea").first();
  await input.fill("I need a hydrating serum with hyaluronic acid");
  await input.press("Enter");
  // Real pipeline reply (matching-service / ai-advisor) — wait for its product cards.
  await page.locator("#bw-widget-host .bw-pcard").first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(2500);
  await settle(page);
  for (const locale of LOCALES) await shot(page, locale, "desktop-widget");
  await ctx.close();
}

const browser = await chromium.launch({
  channel: "chrome",
  args: HAS_CAMERA ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${FAKE_CAMERA}`] : [],
});
console.log(HAS_CAMERA ? `fake camera: ${FAKE_CAMERA}` : "no fake camera — scan shot without the viewfinder");
try {
  for (const locale of LOCALES) {
    console.log(`[${locale}]`);
    await mobileShots(browser, locale);
    await adminShots(browser, locale);
  }
  console.log("[widget]");
  await widgetShot(browser);
} finally {
  await browser.close();
}
