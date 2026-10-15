import nodemailer, { type Transporter } from "nodemailer";

/** Real SMTP transporter (Gmail SMTP by default — see .env.local /
 * docs/installation.md for the App Password setup). Cached on globalThis
 * so Next.js's dev-mode hot reload doesn't reconnect on every file save
 * (same pattern as lib/db.ts's pg Pool). */

const globalForSmtp = globalThis as unknown as {
  __beautyAdvisorSmtp?: Transporter;
};

function createTransporter(): Transporter {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "SMTP is not configured — set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in .env.local (see docs/installation.md)."
    );
  }

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: process.env.SMTP_SECURE !== "false",
    auth: { user, pass },
  });
}

export function getSmtpTransporter(): Transporter {
  if (!globalForSmtp.__beautyAdvisorSmtp) {
    globalForSmtp.__beautyAdvisorSmtp = createTransporter();
  }
  return globalForSmtp.__beautyAdvisorSmtp;
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
