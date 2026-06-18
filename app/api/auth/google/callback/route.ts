import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "oauth_callback_disabled");
  return NextResponse.redirect(loginUrl);
}
