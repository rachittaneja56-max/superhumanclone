import { OAuth2RequestError } from "oslo/oauth2";
import { assertGoogleOAuthConfig, createGoogleOAuthClient } from "@/lib/oauth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeCallbackUrl(callbackUrl: string | null) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/inbox";
  }
  return callbackUrl;
}

type GoogleAuthErrorCode =
  | "oauth_state"
  | "oauth_config"
  | "oauth_token"
  | "oauth_userinfo"
  | "oauth_db"
  | "oauth_session";

function redirectToLogin(request: Request, error: GoogleAuthErrorCode) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

function clearGoogleAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_code_verifier");
  cookieStore.delete("google_auth_callback");
}

function logGoogleAuthFailure(stage: GoogleAuthErrorCode, error: unknown) {
  console.error("[Auth] Google callback failed", {
    stage,
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value ?? null;
  const storedCodeVerifier = cookieStore.get("google_code_verifier")?.value ?? null;
  const callbackUrlCookie = cookieStore.get("google_auth_callback");
  const callbackUrl = normalizeCallbackUrl(callbackUrlCookie ? callbackUrlCookie.value : "/inbox");

  if (!code || !state || !storedState || state !== storedState || !storedCodeVerifier) {
    clearGoogleAuthCookies(cookieStore);
    return redirectToLogin(request, "oauth_state");
  }

  try {
    const { clientSecret } = assertGoogleOAuthConfig(request);
    const googleOAuthClient = createGoogleOAuthClient(request);

    let tokens: any;
    try {
      tokens = await googleOAuthClient.validateAuthorizationCode(
        code,
        {
          codeVerifier: storedCodeVerifier,
          credentials: clientSecret,
          authenticateWith: "request_body"
        }
      );
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        logGoogleAuthFailure("oauth_token", error);
      } else {
        logGoogleAuthFailure("oauth_token", error);
      }
      clearGoogleAuthCookies(cookieStore);
      return redirectToLogin(request, "oauth_token");
    }

    let googleUser: {
      sub: string;
      name: string;
      given_name: string;
      family_name: string;
      picture: string;
      email: string;
      email_verified: boolean;
      locale: string;
    };

    try {
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`userinfo_request_failed:${response.status}`);
      }

      googleUser = await response.json();
      if (!googleUser.email) {
        throw new Error("userinfo_missing_email");
      }
    } catch (error) {
      logGoogleAuthFailure("oauth_userinfo", error);
      clearGoogleAuthCookies(cookieStore);
      return redirectToLogin(request, "oauth_userinfo");
    }

    const [{ db, users }, { ensureUserSettings }, { setSession }, { eq, sql }] = await Promise.all([
      import("@/server/db"),
      import("@/server/auth/helpers"),
      import("@/lib/auth"),
      import("drizzle-orm")
    ]);

    let userId: string;
    try {
      const existingUsers = await db
        .select({
          id: sql<string>`"id"`,
          emailVerified: sql<Date | null>`"emailVerified"`,
        })
        .from(users)
        .where(eq(users.email, googleUser.email))
        .limit(1);

      const existingUser = existingUsers[0];

      if (!existingUser) {
        userId = crypto.randomUUID();
        await db.execute(sql`
          insert into "users" ("id", "email", "name", "image", "emailVerified")
          values (
            ${userId},
            ${googleUser.email},
            ${googleUser.name},
            ${googleUser.picture},
            ${googleUser.email_verified ? new Date() : null}
          )
        `);

        const { ensureTenantProvisioned } = await import('@/server/corsair/provision');
        await ensureTenantProvisioned(userId).catch((error) =>
          console.error("[Auth] Corsair tenant provisioning failed", {
            stage: "corsair_provision",
            message: error instanceof Error ? error.message : "Unknown error",
          })
        );
      } else {
        userId = existingUser.id;
        await db.execute(sql`
          update "users"
          set
            "name" = ${googleUser.name},
            "image" = ${googleUser.picture},
            "emailVerified" = ${
              googleUser.email_verified && !existingUser.emailVerified
                ? new Date()
                : existingUser.emailVerified
            }
          where "id" = ${userId}
        `);
      }

      await ensureUserSettings(userId);
    } catch (error) {
      logGoogleAuthFailure("oauth_db", error);
      clearGoogleAuthCookies(cookieStore);
      return redirectToLogin(request, "oauth_db");
    }

    try {
      await setSession(userId);
    } catch (error) {
      logGoogleAuthFailure("oauth_session", error);
      clearGoogleAuthCookies(cookieStore);
      return redirectToLogin(request, "oauth_session");
    }

    clearGoogleAuthCookies(cookieStore);
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  } catch (error) {
    logGoogleAuthFailure("oauth_config", error);
    clearGoogleAuthCookies(cookieStore);
    return redirectToLogin(request, "oauth_config");
  }
}
