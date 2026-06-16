import { destroySession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST() {
  await destroySession();
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`);
}

export async function GET() {
  await destroySession();
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`);
}
