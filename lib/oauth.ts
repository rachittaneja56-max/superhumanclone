import 'server-only';
import { OAuth2Client } from "oslo/oauth2";
import { getAuthRequestBaseUrl, getConfiguredAuthUrl } from "@/server/corsair/url";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function getRequiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "ENCRYPTION_KEY") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[Auth] Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGoogleOAuthRedirectUri(request?: Request) {
  const baseUrl = request ? getAuthRequestBaseUrl(request) : getConfiguredAuthUrl();
  return `${baseUrl}/api/auth/google/callback`;
}

export function assertGoogleOAuthConfig(request?: Request) {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv("GOOGLE_CLIENT_SECRET");
  const encryptionKey = getRequiredEnv("ENCRYPTION_KEY");
  const redirectURI = getGoogleOAuthRedirectUri(request);

  try {
    new URL(redirectURI);
  } catch {
    throw new Error("[Auth] Invalid Google OAuth redirect URI");
  }

  return {
    clientId,
    clientSecret,
    encryptionKey,
    redirectURI,
  };
}

export function createGoogleOAuthClient(request?: Request) {
  const { clientId, redirectURI } = assertGoogleOAuthConfig(request);

  return new OAuth2Client(
    clientId,
    GOOGLE_AUTH_URL,
    GOOGLE_TOKEN_URL,
    {
      redirectURI,
    }
  );
}
