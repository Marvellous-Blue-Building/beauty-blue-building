"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { TabBarGate } from "@/components/layout/TabBarGate";

/** The landing page, admin login and dashboard draw their own full-screen
 * glass UI, so they don't get the shopper app's mobile chrome. */
function isAdminSurface(pathname: string) {
  return pathname === "/" || pathname === "/login" || pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * The shopper app's phone-width frame (top bar, scrolling body, tab bar) —
 * only on shopper routes. Admin surfaces get just their page over the login
 * photo, so a frame with no page yet (e.g. /login redirecting a signed-in
 * admin to /admin) shows the same backdrop instead of the shopper top bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAdminSurface(pathname)) {
    return (
      <>
        <div aria-hidden className="fixed inset-0 bg-admin-cream bg-cover bg-center" style={{ backgroundImage: "url(/admin/login-bg.jpg)" }} />
        {children}
      </>
    );
  }
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-app-bg">
      <TopBar />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
      <TabBarGate />
    </div>
  );
}
