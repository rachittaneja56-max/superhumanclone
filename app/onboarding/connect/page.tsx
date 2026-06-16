import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { userSettings, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { reconcileGoogleConnectionState } from "@/server/auth/helpers";
import { ConnectWorkspace } from "@/components/onboarding/ConnectWorkspace";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string; plugin?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  const userId = session.userId;
  if (!userId) redirect("/login");

  const localUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true },
  });

  const firstName = localUser?.name?.split(" ")[0] || "User";

  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });

  if (!settings) {
    const [newSettings] = await db.insert(userSettings).values({ userId }).returning();
    settings = newSettings;
  }

  const liveConnections = await reconcileGoogleConnectionState(userId).catch(() => ({
    gmailConnected: settings.gmailConnected,
    calendarConnected: settings.calendarConnected,
  }));
  settings.gmailConnected = liveConnections.gmailConnected;
  settings.calendarConnected = liveConnections.calendarConnected;

  if (settings.gmailConnected && !settings.privacyConfigured) {
    redirect("/onboarding/privacy");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {(resolvedSearchParams.error || resolvedSearchParams.connected === "false") && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center text-sm text-destructive">
          Connection failed. Please try again.
        </div>
      )}
      {resolvedSearchParams.disconnected && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-center text-sm text-amber-700">
          {resolvedSearchParams.disconnected === "gmail"
            ? "Gmail disconnected locally. Reconnect Gmail to continue mail features."
            : resolvedSearchParams.disconnected === "calendar"
              ? "Calendar disconnected locally. Reconnect Calendar to restore calendar features."
              : "All integrations disconnected locally."}
        </div>
      )}

      <ConnectWorkspace
        firstName={firstName}
        gmailConnectUrl="/api/corsair/connect?provider=gmail"
        calendarConnectUrl="/api/corsair/connect?provider=googlecalendar"
        initialGmailConnected={settings.gmailConnected}
        initialCalendarConnected={settings.calendarConnected}
      />
    </div>
  );
}
