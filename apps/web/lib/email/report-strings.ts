import en from "@/messages/en.json";
import id from "@/messages/id.json";

/** Picks the exact strings the scan-report PDF/email need, directly from
 * the same messages/en.json & messages/id.json next-intl already uses
 * elsewhere — kept in sync with the real UI copy without needing React
 * context (rendering a PDF / composing an email body isn't inside a React
 * tree with next-intl's provider, so its `useTranslations` hook isn't
 * available here). */

const MESSAGES = { en, id } as const;

export type SupportedLocale = keyof typeof MESSAGES;

export function resolveLocale(locale: string): SupportedLocale {
  return locale === "id" ? "id" : "en";
}

export function reportStrings(locale: string) {
  const m = MESSAGES[resolveLocale(locale)];
  return {
    diagnostic: m.diagnostic,
    email: m.email,
  };
}

/** `{name}`-style interpolation, matching next-intl's own placeholder syntax — used here because this module runs outside next-intl's React context. */
export function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  );
}
