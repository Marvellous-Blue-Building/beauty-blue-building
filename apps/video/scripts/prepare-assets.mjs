/**
 * Copies what the Remotion composition reads into public/ (gitignored) and the
 * recording's beat marks into src/demo-marks.json (committed, so captions stay
 * in sync with the recording that produced them).
 *
 * usage: npm run assets   (after `npm run record` and `npm run record:admin`)
 */
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_PUBLIC = join(ROOT, "..", "web", "public");
const copies = [
  [join(ROOT, ".recording", "demo.mp4"), "public/clips/demo.mp4"],
  [join(ROOT, ".recording", "demo-marks.json"), "src/demo-marks.json"],
  [join(ROOT, ".recording", "admin.mp4"), "public/clips/admin.mp4"],
  [join(ROOT, ".recording", "admin-marks.json"), "src/admin-marks.json"],
  [join(WEB_PUBLIC, "admin", "login-bg.jpg"), "public/images/login-bg.jpg"],
  [join(WEB_PUBLIC, "admin", "dashboard-bg.jpg"), "public/images/dashboard-bg.jpg"],
  [join(WEB_PUBLIC, "landing", "en", "desktop-admin-overview.jpg"), "public/images/admin-overview.jpg"],
  [join(WEB_PUBLIC, "landing", "en", "desktop-admin-forecasting.jpg"), "public/images/admin-forecasting.jpg"],
  [join(WEB_PUBLIC, "landing", "en", "desktop-admin-conversations.jpg"), "public/images/admin-conversations.jpg"],
];
for (const [from, to] of copies) {
  const dest = join(ROOT, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(from, dest);
  console.log("copied", to);
}
