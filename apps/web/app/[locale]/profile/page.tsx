"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { StatRow } from "@/components/profile/StatRow";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ToggleRow } from "@/components/ui/ToggleRow";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PreviewListSection } from "@/components/profile/PreviewListSection";
import { EmailReportToggleRow } from "@/components/profile/EmailReportToggleRow";
import { LocationToggleRow } from "@/components/profile/LocationToggleRow";
import { Link, useRouter } from "@/i18n/navigation";
import { buttonClassName } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getJSON, patchJSON, postJSON, ApiError } from "@/lib/api-client";
import { useSavedStore } from "@/lib/store/saved-store";
import { useCartStore } from "@/lib/store/cart-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useProductsByIds } from "@/lib/hooks/use-products-by-ids";
import { ProductImage } from "@/components/product/ProductImage";
import { formatCurrency } from "@/lib/format";
import { productHref } from "@/lib/product-href";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import type { UserProfile } from "@/types/user";

export default function ProfilePage() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const savedProductIds = useSavedStore((s) => s.productIds);
  const cartItems = useCartStore((s) => s.items);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchSaved = useSavedStore((s) => s.fetchSaved);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const savedProductsById = useProductsByIds(savedProductIds);
  const cartProductsById = useProductsByIds(cartItems.map((i) => i.productId));

  function loadProfile() {
    return getJSON<UserProfile>("/api/profile")
      .then((p) => {
        setProfile(p);
        setNeedsAuth(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setNeedsAuth(true);
        } else {
          throw err;
        }
      });
  }

  useEffect(() => {
    loadProfile();
  }, []);

  // LocationTracker (mounted app-wide) flips this off in the background if
  // the browser's geolocation permission gets denied/revoked — preferring
  // the auth store's live value over the profile snapshot means an already-
  // open Profile screen reflects that immediately, not just after a reload.
  const authLocationEnabled = useAuthStore((s) => s.user?.realtimeLocationEnabled);

  async function handleLogout() {
    await postJSON("/api/auth/logout");
    router.push("/login");
  }

  if (needsAuth) {
    return (
      <ScreenContainer className="items-center justify-center gap-4 text-center">
        <h2 className="font-display text-[20px] font-semibold text-canvas-ink">Sign in to view your profile</h2>
        <p className="text-[12.5px] text-canvas-ink-muted">
          Your profile, saved products, and cart are tied to your account.
        </p>
        <GoogleSignInButton
          className={buttonClassName({ className: "w-full" })}
          onSignedIn={async () => {
            await fetchUser();
            await Promise.all([loadProfile(), fetchCart(), fetchSaved()]);
          }}
        >
          Sign in with Google
        </GoogleSignInButton>
      </ScreenContainer>
    );
  }

  if (!profile) return null;

  async function togglePreference(key: keyof UserProfile["preferences"]) {
    if (!profile) return;
    const next = { ...profile, preferences: { ...profile.preferences, [key]: !profile.preferences[key] } };
    setProfile(next);
    await patchJSON("/api/profile", { preferences: next.preferences });
  }

  const savedProducts = savedProductIds
    .map((id) => savedProductsById.get(id))
    .filter((p) => p != null);

  return (
    <ScreenContainer>
      <ProfileHero
        profile={profile}
        onAvatarChange={async (dataUrl) => {
          const result = await postJSON<{ avatarUrl: string }>("/api/profile/avatar", { dataUrl });
          setProfile((p) => (p ? { ...p, avatarUrl: result.avatarUrl } : p));
        }}
      />
      <StatRow
        stats={[
          { value: profile.scanScore, label: t("scanScore") },
          { value: profile.dayStreak, label: t("dayStreak") },
          { value: profile.flaggedAllergenCount, label: t("flaggedAllergen") },
        ]}
      />

      <SectionTitle>{t("realtimeLocation")}</SectionTitle>
      <LocationToggleRow
        checked={authLocationEnabled ?? profile.realtimeLocationEnabled}
        address={profile.address}
        onChanged={(checked) =>
          setProfile((p) => (p ? { ...p, realtimeLocationEnabled: checked } : p))
        }
      />

      <SectionTitle action={t("edit")}>{t("preferences")}</SectionTitle>
      <ToggleRow
        label={t("veganFormulasOnly")}
        checked={profile.preferences.vegan}
        onChange={() => togglePreference("vegan")}
      />
      <ToggleRow
        label={t("crueltyFreeOnly")}
        checked={profile.preferences.crueltyFree}
        onChange={() => togglePreference("crueltyFree")}
      />
      <ToggleRow
        label={t("fragranceFreeOnly")}
        checked={profile.preferences.fragranceFree}
        onChange={() => togglePreference("fragranceFree")}
      />

      <PreviewListSection
        title={t("savedProducts")}
        items={savedProducts}
        getKey={(product) => product.id}
        viewAllLabel={t("viewAll")}
        viewAllHref="/shop?filter=saved"
        renderItem={(product) => (
          <Link
            href={productHref(product)}
            className="w-[132px] shrink-0 rounded-[14px] border border-border bg-surface p-[11px]"
          >
            <ProductImage src={product.imageUrl} alt={product.name} className="mb-[9px] h-[72px] w-full rounded-[10px]" sizes="132px" />
            <div className="truncate text-[12px] leading-snug font-bold text-text">{product.name}</div>
            <div className="mt-[3px] text-[10px] text-text-muted">
              {product.brand} · {formatCurrency(product.price)}
            </div>
          </Link>
        )}
      />

      <PreviewListSection
        title={t("yourCart")}
        items={cartItems}
        getKey={(item) => item.productId}
        viewAllLabel={t("viewCart", { count: cartItems.length })}
        viewAllHref="/cart"
        renderItem={(item) => {
          const product = cartProductsById.get(item.productId);
          if (!product) return null;
          return (
            <Link
              href="/cart"
              className="w-[132px] shrink-0 rounded-[14px] border border-border bg-surface p-[11px]"
            >
              <ProductImage src={product.imageUrl} alt={product.name} className="mb-[9px] h-[72px] w-full rounded-[10px]" sizes="132px" />
              <div className="truncate text-[12px] font-bold text-text">{product.name}</div>
              <div className="mt-[3px] text-[10px] text-text-muted">
                Qty {item.quantity} · {formatCurrency(product.price)}
              </div>
            </Link>
          );
        }}
      />

      <SectionTitle
        action={<LocaleSwitcher labels={{ en: "English (EN)", id: "Indonesia (ID)" }} />}
      >
        {t("changeLanguage")}
      </SectionTitle>

      <SectionTitle>{t("account")}</SectionTitle>
      <EmailReportToggleRow
        checked={profile.sendReportEmail}
        onChanged={(checked) => setProfile((p) => (p ? { ...p, sendReportEmail: checked } : p))}
        smtpConfigured={profile.smtpConfigured}
      />
      <ToggleRow label={t("logout")} showToggle={false} onClick={() => setShowLogoutConfirm(true)} />

      {showLogoutConfirm && (
        <ConfirmDialog
          title={t("logoutConfirmTitle")}
          message={t("logoutConfirmMessage")}
          confirmLabel={tc("yes")}
          cancelLabel={tc("no")}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false);
            handleLogout();
          }}
        />
      )}
    </ScreenContainer>
  );
}
