import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { ConnectWorkspace } from "@/components/onboarding/ConnectWorkspace";
import { ensureSafeUserSettings, getSafeUserSettings } from "@/server/db/user-settings-compat";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string; plugin?: string; flow?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  const userId = session.userId;
  if (!userId) redirect("/login");

  const localUser = await db.query.users.findFirst({
    where: eq(users.id, userId!),
    columns: { name: true },
  });

  const firstName = localUser?.name?.split(" ")[0] || "User";

  await ensureSafeUserSettings(userId!);

  // Trust the DB settings — we write gmailConnected/calendarConnected there
  // immediately after OAuth completes. Do NOT run a live Google API probe here
  // because it adds latency and can flip the state back to false on first load.
  const settings = await getSafeUserSettings(userId!);
  const gmailConnected = settings.gmailConnected;
  const calendarConnected = settings.calendarConnected;

  // Both connected → advance to next onboarding step
  if (gmailConnected && calendarConnected) {
    if (!settings.privacyConfigured || !settings.onboardingCompleted) {
      redirect("/onboarding/privacy");
    }
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {resolvedSearchParams.connected === "true" && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-700">
          {resolvedSearchParams.flow === "workspace"
            ? "Google Workspace connected successfully."
            : resolvedSearchParams.plugin === "gmail"
              ? "Gmail connected successfully. Now connect Calendar to continue."
              : resolvedSearchParams.plugin === "googlecalendar"
                ? "Calendar connected successfully. Now connect Gmail to continue."
                : "Connection completed successfully."}
        </div>
      )}
      {(resolvedSearchParams.error || resolvedSearchParams.connected === "false") && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center text-sm text-destructive">
          {resolvedSearchParams.error === "workspace_required"
            ? "Connect Gmail and Calendar before continuing to the dashboard."
            : resolvedSearchParams.error === "gmail_required"
              ? "Connect Gmail before continuing to the dashboard."
              : "Connection failed. Please try again."}
        </div>
      )}
      {resolvedSearchParams.disconnected && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-center text-sm text-amber-700">
          {resolvedSearchParams.disconnected === "gmail"
            ? "Gmail disconnected. Reconnect to continue mail features."
            : resolvedSearchParams.disconnected === "calendar"
              ? "Calendar disconnected. Reconnect to restore calendar features."
              : "All integrations disconnected."}
        </div>
      )}

      <ConnectWorkspace
        firstName={firstName}
        workspaceConnectUrl="/api/corsair/connect?provider=workspace"
        initialGmailConnected={gmailConnected}
        initialCalendarConnected={calendarConnected}
      />
    </div>
  );
}
