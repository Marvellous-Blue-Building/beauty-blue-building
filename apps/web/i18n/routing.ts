import { defineRouting } from "next-intl/routing";

// Both locales are active, but `localePrefix: "never"` keeps the browser URL
// free of any /en or /id segment — the locale is resolved via a cookie
// (set by the middleware / the LocaleSwitcher) instead of the path. The
// app/[locale] folder structure stays as-is; Next.js still needs it
// internally, it's just never reflected in the visible URL.
export const routing = defineRouting({
  locales: ["en", "id"],
  defaultLocale: "en",
  localePrefix: "never",
});
