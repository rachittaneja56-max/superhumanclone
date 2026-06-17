import { redirect } from "next/navigation";

import { BillingClient } from "@/components/billing/BillingClient";
import { getSession } from "@/lib/auth";
import { serverTrpc } from "@/lib/trpc/server";

export default async function BillingPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const trpc = await serverTrpc();
  const overview = await trpc.billing.getOverview({});

  return <BillingClient initialOverview={overview} />;
}
