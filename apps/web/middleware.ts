import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/**
 * Origin gate for the guest-facing /api/widget/* surface — the one access
 * control a third-party embed relies on (same mechanic the Ganes widget
 * uses for its public chat endpoint): the request's `Origin` header is a
 * forbidden header browser JS cannot spoof, so checking it against an
 * allowlist is enough without API keys or per-visitor auth.
 *
 * ALLOWED_WIDGET_ORIGINS is a comma-separated list (or "*" to allow any
 * origin, useful for local demoing). Every /api/widget/* response also
 * gets the matching CORS headers so the embedding page's fetch() can
 * actually read the response.
 */
const ALLOWED = (process.env.ALLOWED_WIDGET_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | null): boolean {
  if (ALLOWED.includes("*")) return true;
  if (!origin) return false;
  return ALLOWED.includes(origin);
}

function widgetMiddleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin ?? "*");
      res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    }
    return res;
  }

  // Only the chat turn itself is actually gated — config/session are public,
  // read-only, non-secret (same split Ganes makes between its public config
  // GET and its origin-checked public chat POST).
  const isChatRoute = req.nextUrl.pathname === "/api/widget/chat";
  if (isChatRoute && !isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }

  const res = NextResponse.next();
  if (isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin ?? "*");
  }
  return res;
}

export default function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/widget")) {
    return widgetMiddleware(req);
  }
  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)", "/api/widget/:path*"],
};
