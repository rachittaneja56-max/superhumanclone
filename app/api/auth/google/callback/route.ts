import { OAuth2RequestError } from "oslo/oauth2";
import { googleOAuthClient } from "@/lib/oauth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { setSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value ?? null;
  const storedCodeVerifier = cookieStore.get("google_code_verifier")?.value ?? null;

  if (!code || !state || !storedState || state !== storedState || !storedCodeVerifier) {
    return new Response(null, {
      status: 400
    });
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`;
    
    // Validate authorization code
    const tokens: any = await googleOAuthClient.validateAuthorizationCode(
      code,
      {
        codeVerifier: storedCodeVerifier,
        credentials: process.env.GOOGLE_CLIENT_SECRET!,
        authenticateWith: "request_body"
      }
    );

    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });

    const googleUser: {
      sub: string;
      name: string;
      given_name: string;
      family_name: string;
      picture: string;
      email: string;
      email_verified: boolean;
      locale: string;
    } = await response.json();

    let existingUser = await db.query.users.findFirst({
      where: eq(users.email, googleUser.email)
    });

    if (!existingUser) {
      const [newUser] = await db.insert(users).values({
        id: crypto.randomUUID(),
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.picture,
        emailVerified: googleUser.email_verified ? new Date() : null,
      }).returning();
      existingUser = newUser;
    } else {
      // Update missing details if needed
      await db.update(users).set({
        name: googleUser.name,
        image: googleUser.picture,
        emailVerified: googleUser.email_verified && !existingUser.emailVerified ? new Date() : existingUser.emailVerified,
      }).where(eq(users.id, existingUser.id));
    }

    await setSession(existingUser.id);
    
    // Redirect to inbox on success
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/inbox`);
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      return new Response(null, {
        status: 400
      });
    }
    console.error(e);
    return new Response(null, {
      status: 500
    });
  }
}
