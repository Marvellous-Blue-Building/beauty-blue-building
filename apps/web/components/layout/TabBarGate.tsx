"use client";

import { usePathname } from "@/i18n/navigation";
import { isTabRoute, isGuestLockedRoute } from "@/lib/route-meta";
import { useAuthStore } from "@/lib/store/auth-store";
import { TabBar } from "@/components/layout/TabBar";

/** Renders the bottom tab bar only on the 5 routes that should show it — hidden for a guest on a guest-locked route (e.g. Your Routine). */
export function TabBarGate() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  if (!isTabRoute(pathname)) return null;
  if (isGuestLockedRoute(pathname) && !user) return null;
  return <TabBar />;
}
