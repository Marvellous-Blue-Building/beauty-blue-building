/**
 * Minimal, dependency-free Google OAuth 2.0 Authorization Code flow.
 * Written by hand (not NextAuth/Auth.js) so the exact session mechanics
 * requested — a user_sessions row with a 1-day expiry, doubling as both
 * the validity check and the durable audit record — aren't fighting a
 * library's own session/adapter opinions.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — create a Google OAuth Client ID in Google Cloud Console and add it to .env.local`
    );
  }
  return value;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: env("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

interface GoogleTokenResponse {
  id_token: string;
  access_token: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: env("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: string | boolean;
}

/**
 * Verifies the id_token's signature/issuer/audience/expiry via Google's own
 * tokeninfo endpoint (a real network round-trip to Google, not a bare
 * base64 decode) and returns the decoded identity claims.
 */
export async function verifyIdToken(idToken: string): Promise<GoogleIdentity> {
  const res = await fetch(`${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    throw new Error(`Google id_token verification failed: ${res.status} ${await res.text()}`);
  }
  const claims = (await res.json()) as GoogleIdentity & { aud?: string };
  if (claims.aud !== env("GOOGLE_CLIENT_ID")) {
    throw new Error("id_token audience mismatch");
  }
  return claims;
}
