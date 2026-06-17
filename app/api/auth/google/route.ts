
import { generateState, generateCodeVerifier } from "oslo/oauth2";
import { createGoogleOAuthClient } from "@/lib/oauth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function normalizeCallbackUrl(callbackUrl: string | null) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/inbox";
  }
  return callbackUrl;
}

function redirectToLogin(request: Request, error: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = normalizeCallbackUrl(url.searchParams.get("callbackUrl"));

  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  let authUrl: URL;
  try {
    const googleOAuthClient = createGoogleOAuthClient(request);
    authUrl = await googleOAuthClient.createAuthorizationURL({
      state,
      scopes: ["openid", "profile", "email"],
      codeVerifier
    });
  } catch (error) {
    console.error("[Auth] Google auth start failed", {
      stage: "oauth_config",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return redirectToLogin(request, "oauth_config");
  }

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
