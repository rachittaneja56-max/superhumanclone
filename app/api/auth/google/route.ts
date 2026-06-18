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
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "oauth_deprecated");
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(loginUrl);
}
