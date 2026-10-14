import { NextResponse } from "next/server";

/**
 * Builds the tiny HTML page the OAuth callback renders when running inside
 * a popup window: it posts a message back to the window that opened it
 * (the app tab) and closes itself. If there's no opener — e.g. the popup
 * was blocked and the whole tab navigated through the OAuth flow instead —
 * it falls back to a normal full-page redirect so the user isn't stranded
 * on a blank "closing..." page.
 */
export function popupMessageResponse(opts: {
  type: "GOOGLE_AUTH_SUCCESS" | "GOOGLE_AUTH_ERROR";
  fallbackRedirect: string;
  error?: string;
  /** Locale-agnostic path (e.g. "/routine") for the opener's client-side router — only meaningful on success. */
  redirectTo?: string;
}): NextResponse {
  const payload = JSON.stringify({ type: opts.type, error: opts.error, redirectTo: opts.redirectTo });
  const html = `<!doctype html>
<html>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage(${payload}, window.location.origin);
    window.close();
  } else {
    window.location.href = ${JSON.stringify(opts.fallbackRedirect)};
  }
</script>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
