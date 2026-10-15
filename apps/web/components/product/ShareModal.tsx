"use client";

import { useTranslations } from "next-intl";
import { useToastStore } from "@/lib/store/toast-store";
import { formatCurrency } from "@/lib/format";
import { CopyIcon, WhatsAppIcon, TelegramIcon, EmailIcon, CloseIcon } from "@/components/product/ShareIcons";
import type { Product } from "@/types/product";

/** Popup opened from the product detail screen's share icon — full URL +
 * copy-to-clipboard, plus WhatsApp/Telegram/Email share links. */
export function ShareModal({
  product,
  url,
  onClose,
}: {
  product: Product;
  url: string;
  onClose: () => void;
}) {
  const t = useTranslations("product");
  const showToast = useToastStore((s) => s.showToast);

  const shareText = `${product.name} [${formatCurrency(product.price)}]. Check it out.`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("linkCopied"));
    } catch {
      showToast(t("linkCopyFailed"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-[340px] rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[16px] font-semibold text-canvas-ink">{t("share")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border text-text-muted"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-app-bg px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-canvas-ink-muted">{url}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={t("copyLink")}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-border text-text"
          >
            <CopyIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex justify-around">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-[#25D366]"
          >
            <WhatsAppIcon className="h-6 w-6" />
          </a>
          <a
            href={telegramHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-[#229ED9]"
          >
            <TelegramIcon className="h-6 w-6" />
          </a>
          <a
            href={emailHref}
            aria-label="Email"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-text"
          >
            <EmailIcon className="h-6 w-6" />
          </a>
        </div>
      </div>
    </div>
  );
}
