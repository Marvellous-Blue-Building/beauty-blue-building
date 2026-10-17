"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { GlassButton, GlassCard, GlassInput } from "@/components/admin/glass";

/** Admin sign-in (rendered by app/[locale]/login) — glass card per docs/admin-ui-guidelines.md. */
export function AdminLoginForm() {
  const router = useRouter();
  const t = useTranslations("admin.login");
  const tSidebar = useTranslations("admin.sidebar");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Trimmed: a pasted password often carries a stray space/newline.
        body: JSON.stringify({ password: password.trim() }),
      });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
      }
      else if (res.status === 401) setError(t("wrongPassword"));
      else setError(t("httpError", { status: res.status }));
    } catch {
      setError(t("networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-y-auto bg-cover bg-center px-4 py-10"
      style={{ backgroundImage: "url(/admin/login-bg.jpg)" }}
    >
      {/* Soft pastel orbs, echoing the glassmorphism reference's backdrop. */}
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-admin-rose/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -top-20 right-1/4 h-72 w-72 rounded-full bg-admin-mint/50 blur-3xl" />

      <GlassCard className="relative w-full max-w-[420px] p-8 sm:p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-admin-accent text-white shadow-[0_8px_20px_-6px_rgb(210_98_135/0.55)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
              <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-bold text-admin-ink">{tSidebar("appName")}</div>
            <div className="text-xs text-admin-ink-muted">{tSidebar("tenantDashboard")}</div>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-admin-ink">{t("welcome")}</h1>
        <p className="mt-1.5 text-sm text-admin-ink-muted">{t("subtitle")}</p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-admin-ink-muted">{t("passwordLabel")}</span>
            <GlassInput
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("passwordPlaceholder")}
              autoFocus
              autoComplete="current-password"
              aria-invalid={!!error}
              leading={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="4" y="10" width="16" height="10" rx="2.5" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              }
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  className="shrink-0 rounded-lg p-1 text-admin-ink-faint transition hover:text-admin-ink"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              }
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-admin-danger/20 bg-admin-danger/10 px-3.5 py-2.5 text-xs font-medium text-admin-danger">
              {error}
            </p>
          )}

          <GlassButton type="submit" disabled={!password || submitting} className="mt-1 w-full">
            {submitting ? t("checking") : t("submit")}
            {!submitting && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </GlassButton>
        </form>

        <p className="mt-6 text-center text-[11px] text-admin-ink-faint">{t("footnote")}</p>
      </GlassCard>
    </div>
  );
}
