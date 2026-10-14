"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { CartSummary } from "@/components/cart/CartSummary";
import { buttonClassName } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useCartStore } from "@/lib/store/cart-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useProductsByIds } from "@/lib/hooks/use-products-by-ids";

export default function CartPage() {
  const t = useTranslations("cart");
  const items = useCartStore((s) => s.items);
  const requiresAuth = useCartStore((s) => s.requiresAuth);
  const fetchCart = useCartStore((s) => s.fetchCart);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const productsById = useProductsByIds(items.map((i) => i.productId));

  const subtotal = items.reduce((sum, item) => {
    const product = productsById.get(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

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

      {requiresAuth ? (
        <GoogleSignInButton
          className={buttonClassName({ className: "mb-4 block w-full" })}
          onSignedIn={async () => {
            await fetchUser();
            await fetchCart();
          }}
        >
          Sign in with Google to use your cart
        </GoogleSignInButton>
      ) : items.length === 0 ? (
        <p className="mb-4 text-[13px] text-text-muted">Your cart is empty.</p>
      ) : (
        items.map((item) => {
          const product = productsById.get(item.productId);
          return product ? <CartItemRow key={item.productId} item={item} product={product} /> : null;
        })
      )}

      <CartSummary subtotal={subtotal} />

      <div className="flex-1" />
      <div className="flex gap-2.5">
        <Link href="/shop" className={buttonClassName({ variant: "ghost", className: "flex-1" })}>
          {t("continueShopping")}
        </Link>
        <Link href="/profile" className={buttonClassName({ className: "flex-1" })}>
          {t("checkout")}
        </Link>
      </div>
    </ScreenContainer>
  );
}
