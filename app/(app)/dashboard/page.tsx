import { endOfWeek, startOfDay } from "date-fns";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { serverTrpc } from "@/lib/trpc/server";
import { reconcileGoogleConnectionState } from "@/server/auth/helpers";
import { CommandCenterDashboard } from "@/components/dashboard/CommandCenterDashboard";

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const trpc = await serverTrpc();
  const connectionStatePromise = reconcileGoogleConnectionState(session.userId).catch(() => ({
    gmailConnected: false,
    calendarConnected: false,
  }));

  const today = new Date();
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const settings = await safe(trpc.settings.getUserSettings({}), null);
  const digestEnabled = Boolean(settings?.morningDigestEnabled && settings.aiEnabled && settings.privacyConfigured);

  const [
    billing,
    unreadCounts,
    inboxThreads,
    auditLogs,
    calendarEvents,
    digest,
    connectionState,
  ] = await Promise.all([
    safe(trpc.billing.getOverview({}), null),
    safe(trpc.email.getUnreadCounts({}), null),
    safe(trpc.email.getMailboxThreads({ folder: "inbox", limit: 12, offset: 0, query: "" }), { items: [], nextPageToken: null }),
    safe(trpc.audit.getAuditLog({ limit: 8 }), []),
    safe(trpc.calendar.getEvents({ startDate: startOfDay(today), endDate: weekEnd }), []),
    digestEnabled ? safe(trpc.email.getMorningDigest({}), null) : Promise.resolve(null),
    connectionStatePromise,
  ]);

  return (
    <CommandCenterDashboard
      settings={settings}
      connectionState={connectionState}
      billing={billing}
      unreadCounts={unreadCounts}
      inboxThreads={inboxThreads.items ?? []}
      calendarEvents={calendarEvents.map((event: any) => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
      }))}
      auditLogs={auditLogs.map((log: any) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt ?? log.created_at,
        details: log.details,
      }))}
      digest={digest}
    />
  );
}
