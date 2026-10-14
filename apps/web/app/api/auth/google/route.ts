import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildGoogleAuthUrl } from "@/lib/auth/google-oauth";

const STATE_COOKIE = "oauth_state";

/** Kicks off the Google OAuth flow — the Sign In screen's "Sign in with Google" button links here. */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
