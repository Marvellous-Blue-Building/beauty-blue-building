import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { TopBar } from "@/components/layout/TopBar";
import { TabBarGate } from "@/components/layout/TabBarGate";
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
          <div className="mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-app-bg">
            <TopBar />
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
            <TabBarGate />
          </div>
          <ToastViewport />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
