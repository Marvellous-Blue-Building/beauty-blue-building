"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import { getRouteMeta, isGuestLockedRoute } from "@/lib/route-meta";
import { useCartStore } from "@/lib/store/cart-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useChatUIStore } from "@/lib/store/chat-ui-store";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { HistoryIcon, ClearChatIcon, CartIcon } from "@/components/layout/TabIcons";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("nav");
  const meta = getRouteMeta(pathname);
  const user = useAuthStore((s) => s.user);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const cartCount = useCartStore((s) =>
    s.items.reduce((sum, i) => sum + i.quantity, 0)
  );
  // /shop?filter=saved reuses the Shop route but reads as its own screen —
  // its own title and a back button, same as /shop/matched.
  const isSavedFilter = pathname === "/shop" && searchParams.get("filter") === "saved";
  // Guests landing on Welcome straight from "Continue as Guest" get a back
  // button so they can return to Sign In; direct/returning arrivals don't.
  const isWelcomeFromGuest =
    pathname === "/welcome" && searchParams.get("from") === "guest";
  const titleKey = isSavedFilter ? "savedProducts" : meta.titleKey;
  // Any of these overrides every other chrome rule for this bar — no back
  // button, no action button (cart/clear chat/etc.), no bottom tab bar
  // (see TabBarGate) — just the title and nothing else.
  const isLockedOut = sessionExpired || (isGuestLockedRoute(pathname) && !user);
  const showBack = !isLockedOut && (isSavedFilter || meta.showBack || isWelcomeFromGuest);
  // Shortcut to the saved-products view, shown only on the main Shop
  // Products screen (not when already viewing it via ?filter=saved).
  const showSavedShortcut = pathname === "/shop" && !isSavedFilter;
  // On the live AI Advisor screen, the cart icon slot is replaced by
  // Clear Chat + Conversation History buttons instead.
  const isChatScreen = pathname === "/chat";
  const showCart = meta.showCart && !isChatScreen && !isLockedOut;
  const requestClear = useChatUIStore((s) => s.requestClear);
  const canClear = useChatUIStore((s) => s.canClear);
  // The language switcher only makes sense before a session exists — on
  // Profile it lives in the page body instead (its own "Change Language"
  // section, above Account).
  const isLoginScreen = pathname === "/login";

  return (
    <header className="flex items-center gap-[10px] border-b border-border px-[18px] py-[14px]">
      {showBack && (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface font-bold text-text"
        >
          ←
        </button>
      )}
      <h1 className="flex-1 text-[13.5px] font-semibold tracking-[0.4px] text-canvas-ink uppercase">
        {sessionExpired ? t("sessionExpired") : t(titleKey)}
      </h1>
      {!isLockedOut && showSavedShortcut && (
        <Link
          href="/shop?filter=saved"
          aria-label="All Saved Products"
          className="flex h-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface px-2.5 text-[10px] font-bold uppercase tracking-[0.3px] text-text"
        >
          {t("allSavedProducts")}
        </Link>
      )}
      {isLockedOut ? (
        <div className="h-[30px] w-[30px] shrink-0" />
      ) : isLoginScreen ? (
        <LocaleSwitcher />
      ) : isChatScreen ? (
        <>
          <button
            type="button"
            onClick={requestClear}
            disabled={!canClear}
            aria-label="Clear Chat"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text disabled:opacity-40"
          >
            <ClearChatIcon className="h-4 w-4" />
          </button>
          <Link
            href="/chat/history"
            aria-label="Conversation History"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
          >
            <HistoryIcon className="h-4 w-4" />
          </Link>
        </>
      ) : showCart ? (
        <Link
          href="/cart"
          aria-label="Cart"
          className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
        >
          <CartIcon className="h-4 w-4" />
          {cartCount > 0 && (
            <span className="absolute -top-[5px] -right-[5px] flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-[3px] font-mono text-[9px] font-bold text-surface">
              {cartCount}
            </span>
          )}
        </Link>
      ) : (
        <div className="h-[30px] w-[30px] shrink-0" />
      )}
    </header>
  );
}
