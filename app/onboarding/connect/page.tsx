import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { reconcileGoogleConnectionState } from "@/server/auth/helpers";
import { ConnectWorkspace } from "@/components/onboarding/ConnectWorkspace";
import { ensureSafeUserSettings, getSafeUserSettings } from "@/server/db/user-settings-compat";

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

  await ensureSafeUserSettings(userId);
  const settings = await getSafeUserSettings(userId);

  const liveConnections = await reconcileGoogleConnectionState(userId).catch(() => ({
    gmailConnected: settings.gmailConnected,
    calendarConnected: settings.calendarConnected,
  }));
  const gmailConnected = liveConnections.gmailConnected;
  const calendarConnected = liveConnections.calendarConnected;

  if (gmailConnected && !settings.privacyConfigured) {
    redirect("/onboarding/privacy");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {resolvedSearchParams.connected === "true" && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-700">
          {resolvedSearchParams.plugin === "gmail"
            ? "Gmail connected successfully. Finalizing your workspace."
            : resolvedSearchParams.plugin === "googlecalendar"
              ? "Calendar connected successfully. Finalizing your workspace."
              : "Connection completed successfully."}
        </div>
      )}
      {(resolvedSearchParams.error || resolvedSearchParams.connected === "false") && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center text-sm text-destructive">
          {resolvedSearchParams.error === "gmail_required"
            ? "Connect Gmail before continuing to the dashboard."
            : "Connection failed. Please try again."}
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
        initialGmailConnected={gmailConnected}
        initialCalendarConnected={calendarConnected}
      />
    </div>
  );
}
