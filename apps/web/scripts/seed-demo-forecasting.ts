/**
 * Demo/dev seed for the Forecasting section (Fase 1-3) — NOT run in
 * production, NOT wired into any app code path. Everything it inserts is
 * clearly demo data: a dedicated `demo-seed@local.test` user (for
 * cart_items, which need a real users.id FK) and ordinary widget_sessions/
 * widget_conversations/widget_messages (no FK to real users at all) with
 * backdated timestamps, run through the exact same real Holt/CUSUM/uplift/
 * sentiment code the app already ships — only the volume of activity is
 * synthetic, not the algorithms.
 *
 * Usage (from apps/web):
 *   node --env-file=.env.local --experimental-strip-types scripts/seed-demo-forecasting.ts
 *   node --env-file=.env.local --experimental-strip-types scripts/seed-demo-forecasting.ts --clean
 *
 * `--clean` reverses exactly what the last seed run inserted, using the
 * manifest file written alongside this script (not a guess/LIKE-based
 * delete) — safe to run even if you've since added real data.
 */
import { Client } from "pg";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, ".demo-seed-manifest.json");
const DAY_MS = 86400000;
const now = Date.now();

function daysAgo(d: number, hourOffset = 0): Date {
  return new Date(now - d * DAY_MS + hourOffset * 3600000);
}
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

const NEUTRAL_TEXTS = [
  "rekomendasi untuk kulit kering dong",
  "ada yang cocok buat kulit berminyak?",
  "cari serum buat kulit kusam",
  "produk apa yang bagus buat pemula?",
  "ada warna lain nggak?",
  "berapa harganya ya?",
  "looking for something for sensitive skin",
  "what do you recommend for dry skin?",
  "cocok nggak ya buat kulit kombinasi",
  "ada yang lebih murah?",
];
const POSITIVE_TEXTS = [
  "wah cocok banget, kulit jadi lembut!",
  "suka banget sama produk ini, recommended banget",
  "mantap, kulit jadi glowing",
  "worth it banget sih ini",
  "love it, bakal repurchase",
  "best product ever, sangat membantu",
  "puas banget, wangi banget juga",
];
const NEGATIVE_TEXTS = [
  "kecewa, bikin breakout parah",
  "mahal banget tapi ga cocok di kulit aku",
  "nyesel beli ini, iritasi",
  "kapok, tidak cocok sama sekali",
  "awful, gak worth it",
];

function pickSentiment(): "positive" | "negative" | "neutral" {
  const r = Math.random();
  if (r < 0.15) return "positive";
  if (r < 0.25) return "negative";
  return "neutral";
}
function pickText(s: "positive" | "negative" | "neutral"): string {
  if (s === "positive") return pick(POSITIVE_TEXTS);
  if (s === "negative") return pick(NEGATIVE_TEXTS);
  return pick(NEUTRAL_TEXTS);
}

interface CartRow {
  id: string;
  userId: string;
  productId: string;
  addedAt: Date;
}
interface SessionRow {
  id: string;
  createdAt: Date;
  promoCode: string | null;
}
interface ConversationRow {
  id: string;
  sessionId: string;
  createdAt: Date;
}
interface MessageRow {
  id: string;
  conversationId: string;
  role: "user" | "bot";
  text: string | null;
  recommendedProductIds: string[] | null;
  createdAt: Date;
}

const cartRows: CartRow[] = [];
const sessionRows: SessionRow[] = [];
const conversationRows: ConversationRow[] = [];
const messageRows: MessageRow[] = [];
const seededSessionIds: string[] = [];

/** `cart_items` has a UNIQUE(user_id, product_id) constraint — it's a
 * live-cart snapshot (one row per user per product, with a `quantity`),
 * NOT an append-only event log. To get many backdated "cart add" points
 * for one product (needed for a real hourly series), each one must come
 * from a DIFFERENT user — hence a pool of synthetic users below, with a
 * per-product used-set so we never attempt a duplicate (user, product). */
let cartUserPool: string[] = [];
const usedCartPairs = new Set<string>();

function allocateCartUser(productId: string): string | null {
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = pick(cartUserPool);
    const key = `${candidate}:${productId}`;
    if (!usedCartPairs.has(key)) {
      usedCartPairs.add(key);
      return candidate;
    }
  }
  return null; // pool exhausted for this product — skip this one cart unit, harmless
}

/** One burst of activity for a product at a point in time: `cartCount`
 * separate cart-add rows (each from a distinct synthetic user), and a
 * widget conversation with `chatCount` bot-recommends-this-product +
 * visitor-reply message pairs. */
function addActivity(params: { productId: string; at: Date; cartCount: number; chatCount: number; promoCode?: string }) {
  // Hour-align the base time first: `params.at` otherwise inherits
  // "now"'s own minute/second (daysAgo() only subtracts whole days/hours),
  // so a 0-50min jitter off a non-:00 base could roll past the hour
  // boundary and split one intended burst across two bucket rows.
  const hourStart = new Date(params.at);
  hourStart.setMinutes(0, 0, 0);

  for (let i = 0; i < params.cartCount; i++) {
    const userId = allocateCartUser(params.productId);
    if (!userId) continue;
    cartRows.push({
      id: randomUUID(),
      userId,
      productId: params.productId,
      addedAt: new Date(hourStart.getTime() + randInt(0, 55) * 60000),
    });
  }
  if (params.chatCount > 0) {
    const sessionId = randomUUID();
    const conversationId = randomUUID();
    sessionRows.push({ id: sessionId, createdAt: hourStart, promoCode: params.promoCode ?? null });
    conversationRows.push({ id: conversationId, sessionId, createdAt: hourStart });
    seededSessionIds.push(sessionId);
    for (let i = 0; i < params.chatCount; i++) {
      // Small, bounded jitter off the hour-aligned base so a burst always
      // lands in ONE hourly bucket regardless of chatCount — an earlier
      // `i * 5min` spacing, and jitter off a non-hour-aligned base, both
      // let one intended burst spill into neighboring hour buckets.
      const botAt = new Date(hourStart.getTime() + randInt(0, 55) * 60000);
      const sentiment = pickSentiment();
      messageRows.push({
        id: randomUUID(),
        conversationId,
        role: "bot",
        text: "Rekomendasi untuk kamu:",
        recommendedProductIds: [params.productId],
        createdAt: botAt,
      });
      messageRows.push({
        id: randomUUID(),
        conversationId,
        role: "user",
        text: pickText(sentiment),
        recommendedProductIds: null,
        createdAt: new Date(botAt.getTime() + 30000),
      });
    }
  }
}

/** Long-tail background: sparse, roughly uniform activity across the full
 * window — this is what gives Modul 2's "jendela bersih" a real median to
 * compare event windows against, instead of a baseline of zero. */
function seedBackground(productId: string, spanDaysAgoMin: number, spanDaysAgoMax: number, count: number) {
  for (let i = 0; i < count; i++) {
    const d = randInt(spanDaysAgoMin, spanDaysAgoMax);
    const h = randInt(0, 23);
    addActivity({ productId, at: daysAgo(d, h), cartCount: randInt(0, 1), chatCount: randInt(1, 2) });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set — run with: node --env-file=.env.local ...");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  if (process.argv.includes("--clean")) {
    await clean(client);
    await client.end();
    return;
  }

  console.log("Creating synthetic cart-user pool (cart_items is a live-cart snapshot, UNIQUE(user_id, product_id) — one backdated 'add' per user per product)...");
  const POOL_SIZE = 150;
  const poolRows: unknown[][] = [];
  for (let i = 1; i <= POOL_SIZE; i++) {
    const n = String(i).padStart(3, "0");
    poolRows.push([`demo-seed-cartuser-${n}`, `demo-seed-cartuser-${n}@local.test`, `Demo Seed Cart User ${n}`]);
  }
  await bulkInsert(client, "users", ["firebase_uid", "email", "full_name"], poolRows, "ON CONFLICT (email) DO NOTHING");
  cartUserPool = (
    await client.query<{ id: string }>(`SELECT id FROM users WHERE email LIKE 'demo-seed-cartuser-%@local.test'`)
  ).rows.map((r) => r.id);

  const skinCare = (await client.query<{ id: string }>(`SELECT id FROM products WHERE category = 'skin-care' ORDER BY id LIMIT 3`)).rows.map((r) => r.id);
  const makeup = (await client.query<{ id: string }>(`SELECT id FROM products WHERE category = 'makeup' ORDER BY id LIMIT 2`)).rows.map((r) => r.id);
  if (skinCare.length < 3 || makeup.length < 2) throw new Error("Not enough real products in skin-care/makeup categories to seed against.");

  const [heroId, fadingId, steadyId] = skinCare;
  const [makeupA, makeupB] = makeup;

  console.log(`Products: hero=${heroId} fading=${fadingId} steady=${steadyId} makeupA=${makeupA} makeupB=${makeupB}`);

  // --- Long-tail background (140 days) for every seeded product, so the
  // Fase 2 "jendela bersih" (8 weeks before an event's pre-window) has a
  // real non-zero baseline to compare against. "fading" gets a visibly
  // HIGHER baseline than hero/steady on purpose: with cart/chat counts
  // that are mostly 0-1, there's no room to register a "drop" (0 is
  // already the floor) — it needs an elevated normal level to fade FROM. ---
  for (const id of [heroId, steadyId]) seedBackground(id, 10, 139, 70);
  for (let i = 0; i < 50; i++) {
    const d = randInt(10, 139);
    // cartCount stays modest (cart_items needs one synthetic user PER unit,
    // per product — see allocateCartUser — so this can't scale arbitrarily
    // high for one product: 50 iterations x up to 3 keeps total demand for
    // this one product under the 150-user pool). chatCount carries most of
    // the "elevated normal level" instead — widget_messages has no such
    // constraint.
    // Fixed (not randomized) on purpose: a tight, consistent baseline gives
    // a small MAD, which is what actually determines how far (in z-score
    // terms) the recent drop-to-near-zero reads — a WIDER random range here
    // scales MAD right along with it and leaves the z-score unchanged.
    addActivity({ productId: fadingId, at: daysAgo(d, randInt(0, 23)), cartCount: 3, chatCount: 40 });
  }
  for (const id of [makeupA, makeupB]) seedBackground(id, 10, 139, 50);

  // --- Event A: skin-care flash sale, 70-68 days ago, 'selesai'. Boost
  // all 3 skin-care products during the window so Modul 2's uplift calc
  // has a real, measurable spike vs. the background median above. ---
  const eventAStart = daysAgo(70);
  const eventAEnd = daysAgo(68);
  let skinPromoCount = 0;
  for (let h = 70 * 24; h >= 68 * 24; h -= randInt(3, 6)) {
    for (const id of [heroId, fadingId, steadyId]) {
      skinPromoCount++;
      addActivity({
        productId: id,
        at: daysAgo(h / 24),
        cartCount: randInt(1, 2),
        chatCount: randInt(3, 5),
        promoCode: skinPromoCount <= 6 ? "SKINFLASH20" : undefined,
      });
    }
  }

  // --- Event B: makeup bazar, 40-37 days ago, 'selesai'. ---
  let makeupPromoCount = 0;
  for (let h = 40 * 24; h >= 37 * 24; h -= randInt(4, 7)) {
    for (const id of [makeupA, makeupB]) {
      makeupPromoCount++;
      addActivity({
        productId: id,
        at: daysAgo(h / 24),
        cartCount: randInt(1, 2),
        chatCount: randInt(3, 4),
        promoCode: makeupPromoCount <= 3 ? "MAKEUPBAZAR" : undefined,
      });
    }
  }

  // --- Recent period (last 10 days): normal continued background for
  // "steady", a sharp drop to near-nothing for "fading" (Fase 1 CUSUM
  // "Fading" alarm needs several recent LOW-but-present points), and a
  // sharp spike in just the last day for "hero" (CUSUM "Surge"). ---
  seedBackground(steadyId, 1, 9, 10);

  for (let d = 9; d >= 0; d--) {
    addActivity({ productId: fadingId, at: daysAgo(d, randInt(8, 20)), cartCount: 0, chatCount: 1 });
  }

  // Monotonically ramping toward "now" (not randomized per-step) so Holt's
  // trend reads unambiguously "up" and the very last point — the one CUSUM's
  // Surge check actually looks at — is the highest of all.
  const heroHours = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
  heroHours.forEach((h, i) => {
    // cartCount grows modestly (pool-constrained); chatCount carries most
    // of the visible spike (unconstrained, and now that message timestamps
    // jitter within ±50min instead of `i*5min`, a 40+ chatCount burst still
    // lands in a single hourly bucket instead of spilling into neighbors).
    addActivity({ productId: heroId, at: daysAgo(h / 24), cartCount: 2 + i, chatCount: 8 + i * 4 });
  });

  // --- Upcoming events (Fase 2 "estimasi" / "estimasi kasar" demo) ---
  const eventC = randomUUID(); // same sub_type as Event A -> "lookup" match
  const eventD = randomUUID(); // different sub_type, no match -> "estimasi kasar"

  console.log("Inserting event_calendar rows...");
  await client.query(
    `INSERT INTO event_calendar (id, name, type, sub_type, starts_at, ends_at, category_focus, discount_pct, ad_budget, promo_code, status)
     VALUES
     ($1,'Flash Sale Skin Care 20%','promo_marketplace','flash_sale',$2,$3,'skin-care',20,3000000,'SKINFLASH20','selesai'),
     ($4,'Beauty Bazar Makeup','event_offline','bazar',$5,$6,'makeup',15,5000000,'MAKEUPBAZAR','selesai'),
     ($7,'Flash Sale Skin Care 25% (upcoming)','promo_marketplace','flash_sale',$8,$9,'skin-care',25,NULL,NULL,'rencana'),
     ($10,'Kampanye Influencer Makeup (upcoming)','campaign','influencer_campaign',$11,$12,'makeup',NULL,8000000,NULL,'rencana')`,
    [
      randomUUID(), eventAStart, eventAEnd,
      randomUUID(), daysAgo(40), daysAgo(37),
      eventC, daysAgo(-14), daysAgo(-16),
      eventD, daysAgo(-21), daysAgo(-23),
    ]
  );

  console.log(`Inserting ${cartRows.length} cart_items, ${sessionRows.length} widget_sessions, ${conversationRows.length} widget_conversations, ${messageRows.length} widget_messages...`);

  await bulkInsert(client, "cart_items", ["id", "user_id", "product_id", "added_at"], cartRows.map((r) => [r.id, r.userId, r.productId, r.addedAt]));
  await bulkInsert(client, "widget_sessions", ["id", "created_at", "last_seen_at", "promo_code"], sessionRows.map((r) => [r.id, r.createdAt, r.createdAt, r.promoCode]));
  await bulkInsert(client, "widget_conversations", ["id", "session_id", "created_at", "updated_at"], conversationRows.map((r) => [r.id, r.sessionId, r.createdAt, r.createdAt]));
  await bulkInsert(
    client,
    "widget_messages",
    ["id", "conversation_id", "role", "text", "recommended_product_ids", "created_at"],
    messageRows.map((r) => [r.id, r.conversationId, r.role, r.text, r.recommendedProductIds, r.createdAt])
  );

  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        cartUserEmailPattern: "demo-seed-cartuser-%@local.test",
        seededSessionIds,
        eventNames: [
          "Flash Sale Skin Care 20%",
          "Beauty Bazar Makeup",
          "Flash Sale Skin Care 25% (upcoming)",
          "Kampanye Influencer Makeup (upcoming)",
        ],
      },
      null,
      2
    )
  );

  console.log("Done. Manifest written to", MANIFEST_PATH);
  console.log("To remove all of this later: node --env-file=.env.local --experimental-strip-types scripts/seed-demo-forecasting.ts --clean");

  await client.end();
}

async function bulkInsert(client: Client, table: string, columns: string[], rows: unknown[][], onConflict = "") {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const colCount = columns.length;
    const values: unknown[] = [];
    const tuples: string[] = [];
    chunk.forEach((row, rowIdx) => {
      const placeholders = row.map((_, colIdx) => `$${rowIdx * colCount + colIdx + 1}`);
      tuples.push(`(${placeholders.join(",")})`);
      values.push(...row);
    });
    await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")} ${onConflict}`, values);
  }
}

async function clean(client: Client) {
  if (!existsSync(MANIFEST_PATH)) {
    console.log("No manifest found at", MANIFEST_PATH, "— nothing to clean (or it was already cleaned).");
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as {
    cartUserEmailPattern: string;
    seededSessionIds: string[];
    eventNames: string[];
  };

  console.log(`Deleting ${manifest.seededSessionIds.length} seeded widget_sessions (cascades conversations/messages)...`);
  for (let i = 0; i < manifest.seededSessionIds.length; i += 500) {
    const chunk = manifest.seededSessionIds.slice(i, i + 500);
    await client.query(`DELETE FROM widget_sessions WHERE id = ANY($1::uuid[])`, [chunk]);
  }

  console.log("Deleting seeded event_calendar rows by name...");
  await client.query(`DELETE FROM event_calendar WHERE name = ANY($1::text[])`, [manifest.eventNames]);

  console.log("Deleting synthetic cart-user pool (cascades cart_items)...");
  await client.query(`DELETE FROM users WHERE email LIKE $1`, [manifest.cartUserEmailPattern]);

  const { default: fs } = await import("fs/promises");
  await fs.unlink(MANIFEST_PATH);
  console.log("Cleaned up. Manifest removed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
