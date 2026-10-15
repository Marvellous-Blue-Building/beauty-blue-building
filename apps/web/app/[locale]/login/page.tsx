"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { Pill } from "@/components/ui/Pill";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { SparkleIcon } from "@/components/layout/TabIcons";
import { postJSON } from "@/lib/api-client";
import { useAuthStore, clearSessionMarker } from "@/lib/store/auth-store";
import { useCartStore } from "@/lib/store/cart-store";
import { useSavedStore } from "@/lib/store/saved-store";

// Scattered twinkle positions inside the login card's decorative visual —
// same idea as wireframe_real_ui.html's pulsing .mesh-dot pattern, but
// sparkle-shaped and in the app's real mint/secondary/primary palette.
const SPARKLES = [
  { top: "20%", left: "28%", size: 14, color: "text-mint", delay: "0s" },
  { top: "15%", left: "68%", size: 10, color: "text-secondary", delay: "0.4s" },
  { top: "45%", left: "48%", size: 18, color: "text-primary", delay: "0.8s" },
  { top: "60%", left: "22%", size: 11, color: "text-secondary", delay: "1.2s" },
  { top: "68%", left: "72%", size: 13, color: "text-mint", delay: "0.2s" },
  { top: "35%", left: "82%", size: 9, color: "text-primary", delay: "1.6s" },
];

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchSaved = useSavedStore((s) => s.fetchSaved);

  async function handleContinueAsGuest() {
    // "Continue as Guest" must mean an actual guest — if the browser still
    // carries a real session cookie from an earlier sign-in, this clears it
    // so isGuest checks downstream (Welcome, Your Routine, TopBar, tab bar)
    // aren't fooled into treating this as an authenticated journey.
    await postJSON("/api/auth/logout").catch(() => {});
    clearSessionMarker();
    await Promise.all([fetchUser(), fetchCart(), fetchSaved()]);
    router.push("/welcome?from=guest");
  }

  return (
    <ScreenContainer className="justify-between">
      <div className="flex flex-col items-center gap-4 pt-7 text-center">
        <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-gradient-to-br from-mint to-secondary font-display text-[26px] font-semibold text-surface shadow-[0_0_44px_-6px_rgba(224,169,150,0.6)]">
          AI
        </div>
        <div>
          <div className="font-display text-[26px] font-semibold text-canvas-ink">
            {t("title")}
          </div>
          <p className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed text-canvas-ink-muted">
            {t("tagline")}
          </p>
        </div>
        <div
          className="relative mt-1.5 h-[190px] w-full overflow-hidden rounded-[18px] border border-border bg-surface"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, rgba(224,169,150,0.3), transparent 55%), radial-gradient(circle at 75% 70%, rgba(194,166,122,0.3), transparent 55%), var(--color-surface)",
          }}
        >
          {SPARKLES.map((s, i) => (
            <SparkleIcon
              key={i}
              className={`absolute animate-pulse ${s.color}`}
              style={{
                top: s.top,
                left: s.left,
                width: s.size,
                height: s.size,
                animationDelay: s.delay,
                animationDuration: "2.2s",
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pb-1.5">
        <GoogleSignInButton
          className="flex w-full items-center justify-center gap-2.5 rounded-[26px] border border-[#e3e3e3] bg-white py-3.5 text-[14px] font-semibold text-[#1f1f1f] disabled:opacity-60"
          onSignedIn={async ({ redirectTo }) => {
            await fetchUser();
            router.push(redirectTo);
          }}
        >
          <GoogleIcon />
          {t("signInGoogle")}
        </GoogleSignInButton>
        <div className="flex w-full items-center gap-2.5 text-[11px] text-text-faint before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-['']">
          {t("or")}
        </div>
        <Pill variant="link">
          <button
            type="button"
            onClick={handleContinueAsGuest}
            className="appearance-none border-0 bg-transparent p-0 text-inherit [font:inherit]"
          >
            {t("continueGuest")}
          </button>
        </Pill>
        <p className="mt-1 max-w-[280px] text-center text-[10px] leading-relaxed text-text-faint">
          {t("legal")}
        </p>
      </div>
    </ScreenContainer>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
