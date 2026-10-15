import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";

/** Real SMTP transporter (Gmail SMTP by default — see .env.local /
 * docs/installation.md for the App Password setup). Cached on globalThis
 * so Next.js's dev-mode hot reload doesn't reconnect on every file save
 * (same pattern as lib/db.ts's pg Pool). */

const globalForSmtp = globalThis as unknown as {
  __beautyAdvisorSmtp?: { key: string; transporter: Transporter };
};

/** Mirrors lib/auth/google-oauth.ts's env() helper — read-and-throw inline,
 * so a credential is never assigned to a bare local variable that outlives
 * the single expression that needs it (and so an accidental future
 * `console.log`/error-serialization of this module's locals can't include
 * it either). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      "SMTP is not configured — set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in .env.local (see docs/installation.md)."
    );
  }
  return value;
}

function createTransporter(): Transporter {
  return nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port: Number(requireEnv("SMTP_PORT")),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
  });
}

/** Fingerprint of the current SMTP config (hashed so the raw password is
 * never stored on globalThis). The cached transporter is rebuilt whenever
 * this changes, so editing .env.local's SMTP_* without a full server
 * restart still switches the account the app authenticates as. */
function smtpConfigFingerprint(): string {
  return createHash("sha256")
    .update(
      [
        process.env.SMTP_HOST ?? "",
        process.env.SMTP_PORT ?? "",
        process.env.SMTP_SECURE ?? "",
        process.env.SMTP_USER ?? "",
        process.env.SMTP_PASS ?? "",
      ].join("\u0000")
    )
    .digest("hex");
}

export function getSmtpTransporter(): Transporter {
  const key = smtpConfigFingerprint();
  if (!globalForSmtp.__beautyAdvisorSmtp || globalForSmtp.__beautyAdvisorSmtp.key !== key) {
    globalForSmtp.__beautyAdvisorSmtp = { key, transporter: createTransporter() };
  }
  return globalForSmtp.__beautyAdvisorSmtp.transporter;
}

export function smtpFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";
}

/** A real format check, not just presence — Gmail App Passwords (the only
 * kind of password Gmail SMTP accepts; a real account password is
 * rejected, confirmed empirically against the real Gmail SMTP server
 * during this feature's own testing) are always exactly 16 characters
 * once the display spaces are stripped. Used to gate "Send Report to My
 * Email" so the toggle can't be turned on when it genuinely can't work —
 * see app/api/profile/route.ts and components/profile/EmailReportToggleRow.tsx. */
export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");

  return Boolean(host && port && user && pass && pass.length === 16);
}
