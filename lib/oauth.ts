import { OAuth2Client } from "oslo/oauth2";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const googleOAuthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID!,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  {
    redirectURI: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  }
);
