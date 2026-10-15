/**
 * Chrome visibility rules per route, ported 1:1 from wireframe_real_ui.html's
 * `titles` / `noCartScreens` / `tabScreens` JS objects. A single <TopBar/>
 * instance in app/[locale]/layout.tsx reads this (keyed by pathname) instead
 * of each page repeating back/cart visibility logic.
 */
export interface RouteMeta {
  /** Key into the "nav" message namespace */
  titleKey: string;
  showBack: boolean;
  showCart: boolean;
}

export const TAB_ROUTES = ["/routine", "/shop", "/chat", "/progress", "/profile"] as const;

const ROUTE_META: Record<string, RouteMeta> = {
  "/login": { titleKey: "signIn", showBack: false, showCart: false },
  "/welcome": { titleKey: "welcome", showBack: false, showCart: false },
  "/scan": { titleKey: "skinScan", showBack: true, showCart: false },
  "/progress/check-in": { titleKey: "recheckSkin", showBack: true, showCart: false },
  "/scan/report": { titleKey: "diagnosticReport", showBack: true, showCart: false },
  "/quiz/skin-type": { titleKey: "skinType", showBack: true, showCart: false },
  "/quiz/concerns": { titleKey: "concerns", showBack: true, showCart: false },
  "/quiz/sensitivities": { titleKey: "sensitivities", showBack: true, showCart: false },
  "/quiz/lifestyle": { titleKey: "lifestyle", showBack: true, showCart: false },
  "/quiz/goals": { titleKey: "goals", showBack: true, showCart: false },
  "/analyzing": { titleKey: "analyzing", showBack: false, showCart: false },
  "/routine": { titleKey: "yourRoutine", showBack: false, showCart: true },
  "/product": { titleKey: "productDetail", showBack: true, showCart: true },
  "/shop": { titleKey: "shopProducts", showBack: false, showCart: true },
  "/shop/matched": { titleKey: "matchedToScan", showBack: true, showCart: true },
  "/chat": { titleKey: "aiAdvisor", showBack: false, showCart: true },
  "/chat/history": { titleKey: "chatHistory", showBack: true, showCart: false },
  "/progress": { titleKey: "progressTracker", showBack: false, showCart: true },
  "/progress/history": { titleKey: "progressHistory", showBack: true, showCart: false },
  "/profile": { titleKey: "profile", showBack: false, showCart: true },
  "/cart": { titleKey: "yourCart", showBack: true, showCart: false },
};

const DEFAULT_META: RouteMeta = {
  titleKey: "welcome",
  showBack: true,
  showCart: true,
};

/** @param pathWithoutLocale e.g. "/product/niacinamide-serum-5" (locale prefix already stripped) */
export function getRouteMeta(pathWithoutLocale: string): RouteMeta {
  if (ROUTE_META[pathWithoutLocale]) {
    return ROUTE_META[pathWithoutLocale];
  }
  if (pathWithoutLocale.startsWith("/product/")) {
    return ROUTE_META["/product"];
  }
  if (pathWithoutLocale.startsWith("/chat/history/")) {
    return { titleKey: "chatHistoryDetail", showBack: true, showCart: false };
  }
  return DEFAULT_META;
}

export function isTabRoute(pathWithoutLocale: string): boolean {
  return (TAB_ROUTES as readonly string[]).includes(pathWithoutLocale);
}

/**
 * Routes that require a real session — chrome that would let a guest
 * navigate further (back button, action button, bottom tab bar) is hidden
 * here, in TopBar/TabBarGate, whenever there's no real session. Prefix-
 * matched, so e.g. "/shop" also covers "/shop/matched".
 *
 * What each route's own BODY does with that is its own choice, not implied
 * by this list: /profile, /cart, /shop, /chat, /progress each swap their
 * entire body for the shared "Sign in to view your profile" gate
 * (components/auth/SignInRequiredScreen); /product/[id] instead keeps the
 * real product visible and only swaps its own CTAs (see that page);
 * /routine shows a real routine preview to guests too, swapping only its
 * bottom CTA for "Sign in with Google to Access More" (see that page).
 */
const GUEST_LOCKED_ROUTES = ["/routine", "/profile", "/cart", "/shop", "/chat", "/progress", "/product"] as const;

export function isGuestLockedRoute(pathWithoutLocale: string): boolean {
  return GUEST_LOCKED_ROUTES.some(
    (route) => pathWithoutLocale === route || pathWithoutLocale.startsWith(`${route}/`)
  );
}
