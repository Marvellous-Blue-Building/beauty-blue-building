import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, verifyIdToken } from "@/lib/auth/google-oauth";
import { upsertUserFromGoogle, createSession } from "@/lib/auth/session";
import { popupMessageResponse } from "@/lib/auth/popup-response";
import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";
import { ensureIndonesiaHolidaysForYear } from "@/lib/indonesia-holiday";

const STATE_COOKIE = "oauth_state";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const origin = request.nextUrl.origin;

  if (!code || !state || !expectedState || state !== expectedState) {
    return popupMessageResponse({
      type: "GOOGLE_AUTH_ERROR",
      error: "oauth_state_mismatch",
      fallbackRedirect: `${origin}/login?error=oauth_state_mismatch`,
    });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const identity = await verifyIdToken(tokens.id_token);

    if (identity.email_verified === false || identity.email_verified === "false") {
      return popupMessageResponse({
        type: "GOOGLE_AUTH_ERROR",
        error: "email_not_verified",
        fallbackRedirect: `${origin}/login?error=email_not_verified`,
      });
    }

    const user = await upsertUserFromGoogle(identity);
    await createSession(user);

    // Best-effort, fire-and-forget — this route is the single path every
    // register/login/relogin funnels through, so it's the natural place to
    // keep Indonesia's national holiday calendar current for
    // services/geotagging-weather's formula. Never blocks the redirect.
    ensureIndonesiaHolidaysForYear(new Date().getFullYear()).catch(() => {});

    // Returning user with a real scan on file → skip onboarding, land
    // straight on Your Routine. First-time/no-scan users still go to
    // Welcome as before.
    const redirectTo = await resolvePostLoginRedirect(user.id);

    const response = popupMessageResponse({
      type: "GOOGLE_AUTH_SUCCESS",
      redirectTo,
      fallbackRedirect: `${origin}${redirectTo}`,
    });
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return popupMessageResponse({
      type: "GOOGLE_AUTH_ERROR",
      error: "oauth_failed",
      fallbackRedirect: `${origin}/login?error=oauth_failed`,
    });
  }
}
