import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSession } from "@/lib/auth";
import { serverTrpc } from "@/lib/trpc/server";
import { reconcileGoogleConnectionState } from "@/server/auth/helpers";
import { DashboardData, DashboardDataSkeleton, DashboardShell } from "@/components/dashboard/DashboardFirstPaint";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const trpc = await serverTrpc();
  const settings = await trpc.settings.getUserSettings({}).catch(() => null);
  const connectionState = await reconcileGoogleConnectionState(session.userId).catch(() => ({
    gmailConnected: false,
    calendarConnected: false,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <DashboardShell settings={settings} connectionState={connectionState} />
        <Suspense fallback={<DashboardDataSkeleton />}>
          <DashboardData settings={settings} connectionState={connectionState} />
        </Suspense>
      </div>
    </div>
  );
}
