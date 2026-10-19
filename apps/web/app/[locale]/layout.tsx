import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { AppShell } from "@/components/layout/AppShell";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { StoreBootstrap } from "@/components/layout/StoreBootstrap";
import { LocationTracker } from "@/components/layout/LocationTracker";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="font-ui">
        <NextIntlClientProvider messages={messages}>
          <StoreBootstrap />
          <LocationTracker />
          <AppShell>{children}</AppShell>
          <ToastViewport />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
