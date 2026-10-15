"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { CartSummary } from "@/components/cart/CartSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { buttonClassName } from "@/components/ui/Button";
import { SignInRequiredScreen } from "@/components/auth/SignInRequiredScreen";
import { useCartStore } from "@/lib/store/cart-store";
import { useCartUIStore } from "@/lib/store/cart-ui-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useProductsByIds } from "@/lib/hooks/use-products-by-ids";

export default function CartPage() {
  const t = useTranslations("cart");
  const items = useCartStore((s) => s.items);
  const requiresAuth = useCartStore((s) => s.requiresAuth);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const emptyCart = useCartStore((s) => s.emptyCart);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const productsById = useProductsByIds(items.map((i) => i.productId));

  // TopBar's "Empty Cart" button lives in the shared layout, not this page
  // — same request/report handshake as chat-ui-store's Clear Chat button.
  const emptyToken = useCartUIStore((s) => s.emptyToken);
  const setCanEmpty = useCartUIStore((s) => s.setCanEmpty);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [prevEmptyToken, setPrevEmptyToken] = useState(emptyToken);
  const canEmpty = items.length > 0;
  if (emptyToken !== prevEmptyToken) {
    setPrevEmptyToken(emptyToken);
    if (canEmpty) setShowEmptyConfirm(true);
  }

  useEffect(() => {
    setCanEmpty(canEmpty);
  }, [canEmpty, setCanEmpty]);

  const subtotal = items.reduce((sum, item) => {
    const product = productsById.get(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  if (requiresAuth) {
    return (
      <SignInRequiredScreen
        title="Sign in to view your profile"
        subtitle="Your profile, saved products, and cart are tied to your account."
        onSignedIn={async () => {
          await fetchUser();
          await fetchCart();
        }}
      />
    );
  }

  return (
    <ScreenContainer>
      <div className="mb-2 text-[10.5px] font-semibold tracking-[1.5px] text-text-faint uppercase">
        {t("itemCount", { count: items.length })}
      </div>
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-canvas-ink">
        {t("title")}
      </h2>
      <p className="mb-[18px] text-[12.5px] leading-relaxed text-canvas-ink-muted">
        {t("subtitle")}
      </p>

      {items.length === 0 ? (
        <p className="mb-4 text-[13px] text-text-muted">Your cart is empty.</p>
      ) : (
        items.map((item) => {
          const product = productsById.get(item.productId);
          return product ? <CartItemRow key={item.productId} item={item} product={product} /> : null;
        })
      )}

      <CartSummary subtotal={subtotal} />

      <div className="flex-1" />
      <Link href="/shop" className={buttonClassName({ variant: "ghost", className: "block w-full" })}>
        {t("continueShopping")}
      </Link>

      {showEmptyConfirm && (
        <ConfirmDialog
          title="Empty cart?"
          message="Are you sure you want to empty your cart?"
          confirmLabel="Empty Cart"
          cancelLabel="Cancel"
          onCancel={() => setShowEmptyConfirm(false)}
          onConfirm={async () => {
            setShowEmptyConfirm(false);
            await emptyCart();
          }}
        />
      )}
    </ScreenContainer>
  );
}
