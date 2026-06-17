import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getUsersColumnPresence } from "@/server/db/users-compat";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { getBillingMode, isRazorpayConfigured } from "@/server/billing/plans";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  if (getBillingMode() !== "razorpay" || !isRazorpayConfigured()) {
    return new Response("Billing webhook unavailable", { status: 404 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await request.text();
  if (!verifyRazorpaySignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET!)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    event?: string;
    payload?: {
      subscription?: { entity?: { notes?: { userId?: string; plan?: "free" | "pro" | "team" } } };
      payment?: { entity?: { notes?: { userId?: string; plan?: "free" | "pro" | "team" } } };
    };
  };

  const notes =
    payload.payload?.subscription?.entity?.notes ??
    payload.payload?.payment?.entity?.notes;

  if (!notes?.userId || !notes.plan) {
    return Response.json({ ok: true, ignored: true });
  }

  const columns = await getUsersColumnPresence();
  if (!columns.hasPlan) {
    return Response.json({ ok: true, ignored: true, reason: "plan_column_missing" });
  }

  await db.update(users).set({ plan: notes.plan }).where(eq(users.id, notes.userId));
  return Response.json({ ok: true });
}
