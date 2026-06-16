
import { generateState, generateCodeVerifier } from "oslo/oauth2";
import { googleOAuthClient } from "@/lib/oauth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function normalizeCallbackUrl(callbackUrl: string | null) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/inbox";
  }
  return callbackUrl;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = normalizeCallbackUrl(url.searchParams.get("callbackUrl"));

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  
  const authUrl = await googleOAuthClient.createAuthorizationURL({
    state,
    scopes: ["openid", "profile", "email"],
    codeVerifier
  });

  const cookieStore = await cookies();
  
  cookieStore.set("google_oauth_state", state, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: "lax"
  });
  
  cookieStore.set("google_code_verifier", codeVerifier, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: "lax"
  });

  cookieStore.set("google_auth_callback", callbackUrl, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: "lax"
  });

  return NextResponse.redirect(authUrl);
}
