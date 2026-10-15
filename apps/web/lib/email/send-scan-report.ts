import { renderToBuffer } from "@react-pdf/renderer";
import { getSmtpTransporter, smtpFromAddress } from "@/lib/email/smtp-client";
import { ScanReportPdf } from "@/lib/email/scan-report-pdf";
import type { ScanReport } from "@/types/scan";

/**
 * `user` must always be the result of this very request's own
 * `getSessionUser()` call (see app/api/match-routine/route.ts) — never a
 * cached/earlier session or anything client-supplied. That's what
 * guarantees the PDF only ever goes to whoever is actually logged in right
 * now, not some other account that happened to scan on this device earlier.
 */
interface ReportRecipient {
  email: string;
  fullName: string | null;
  sendReportEmail: boolean;
}

// Fixed, exact copy (not localized on purpose — specified verbatim).
const EMAIL_SUBJECT = "Your PDF report is ready!";
const EMAIL_BODY = `Your PDF report is ready!

Thank you for completing your skin analysis with us!

Please find your personalized skin analysis report attached as a PDF. It includes your skin scanning results and insights to help you better understand your skin condition and make informed decisions about your skincare routine.

We hope this report helps you discover the right approach to caring for your skin.

If you have any questions, feel free to reach out to us.

Best regards,
Blue Building Team`;

/**
 * Emails the real skin-scan diagnostic report as a PDF — only when the
 * user has "Send My Report to Email" enabled (Profile screen,
 * users.send_report_email). No questionnaire/quiz data is included, only
 * the scan result itself (see lib/email/scan-report-pdf.tsx).
 *
 * Best-effort: failures are logged, never thrown — matches this
 * codebase's existing pattern for non-critical persistence/side effects
 * around scan completion (see app/api/match-routine/route.ts's own
 * try/catch blocks for questionnaire/scan persistence).
 */
export async function sendScanReportEmailIfEnabled(
  user: ReportRecipient,
  report: ScanReport,
  locale: string,
  imageBase64?: string | null
): Promise<void> {
  if (!user.sendReportEmail) return;

  try {
    const pdfBuffer = await renderToBuffer(ScanReportPdf({ report, locale, imageBase64: imageBase64 ?? null }));

    await getSmtpTransporter().sendMail({
      from: smtpFromAddress(),
      to: user.email,
      subject: EMAIL_SUBJECT,
      text: EMAIL_BODY,
      attachments: [{ filename: `skin-scan-report-${report.scanId}.pdf`, content: pdfBuffer }],
    });
  } catch (error) {
    console.error("Failed to send scan report email:", error);
  }
}
