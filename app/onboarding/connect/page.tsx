import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/server/db'
import { userSettings, users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { Mail, Calendar, CheckCircle2 } from 'lucide-react'
import { continueToDashboard, disconnectAll, disconnectCalendar, disconnectGmail } from './actions'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'
import { DisconnectActionForm } from '@/components/onboarding/DisconnectActionForm'

export default async function ConnectPage({
  searchParams
}: {
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string; plugin?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession()
  const userId = session.userId
  if (!userId) redirect('/login')

  const localUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true }
  })

  const firstName = localUser?.name?.split(' ')[0] || 'User'

  // Let's ensure a settings record exists
  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId)
  })

  if (!settings) {
    const [newSettings] = await db.insert(userSettings).values({ userId }).returning()
    settings = newSettings
  }

  const liveConnections = await reconcileGoogleConnectionState(userId).catch(() => ({
    gmailConnected: settings.gmailConnected,
    calendarConnected: settings.calendarConnected,
  }))
  settings.gmailConnected = liveConnections.gmailConnected
  settings.calendarConnected = liveConnections.calendarConnected

  // Enforce Privacy Gate immediately after Gmail is connected (if not done yet)
  if (settings.gmailConnected && !settings.privacyConfigured) {
    redirect('/onboarding/privacy')
  }

  // Generate connect links from Corsair dynamically on redirect
  const gmailConnectUrl = '/api/corsair/connect?provider=gmail'
  const calendarConnectUrl = '/api/corsair/connect?provider=googlecalendar'
  const connectError: string | null = null

  const allConnected = settings.gmailConnected && settings.calendarConnected
  const canContinue = settings.gmailConnected

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 font-sans">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground mb-4">
          Welcome, <span className="text-accent">{firstName}</span>
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto">
          Let&apos;s connect your workspace accounts to bootstrap your integrations and prepare your AI workflows.
        </p>
      </div>

      {(resolvedSearchParams.error || connectError) && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-2xl w-full text-center">
          Connection failed: Please try again.
        </div>
      )}
      {resolvedSearchParams.disconnected && (
        <div className="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 text-sm max-w-2xl w-full text-center">
          {resolvedSearchParams.disconnected === 'gmail'
            ? 'Gmail disconnected locally. Reconnect Gmail to continue mail features.'
            : resolvedSearchParams.disconnected === 'calendar'
              ? 'Calendar disconnected locally. Reconnect Calendar to restore calendar features.'
              : 'All integrations disconnected locally.'}
        </div>
      )}

      {/* Google Workspace Card */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 max-w-2xl w-full mb-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-tag-red">
            <Mail className="w-6 h-6" />
          </div>
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-tag-blue">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-xl font-heading font-bold text-foreground">Google Workspace</h2>
          {settings.gmailConnected && settings.calendarConnected && (
            <span className="px-2.5 py-1 text-xs font-medium bg-tag-green/10 text-tag-green rounded-full">
              Connected
            </span>
          )}
        </div>

        <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">
          Connect your Google Account to authorize Aethra to sync your emails, drafts, and calendar events. This enables your AI assistant to draft emails and schedule calendar meetings.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-border gap-4">
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            {settings.gmailConnected ? (
              <div className="flex items-center justify-center gap-2 text-tag-green font-medium text-sm px-4 py-2.5 border border-border rounded-lg bg-background w-full sm:w-auto">
                <CheckCircle2 className="w-5 h-5" />
                <span>Gmail connected</span>
              </div>
            ) : (
              <a
                href={gmailConnectUrl}
                className="px-6 py-2.5 bg-accent text-accent-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity w-full sm:w-auto text-center"
              >
                Connect Gmail
              </a>
            )}

            {settings.calendarConnected ? (
              <div className="flex items-center justify-center gap-2 text-tag-green font-medium text-sm px-4 py-2.5 border border-border rounded-lg bg-background w-full sm:w-auto">
                <CheckCircle2 className="w-5 h-5" />
                <span>Calendar connected</span>
              </div>
            ) : (
              <a
                href={calendarConnectUrl}
                className="px-6 py-2.5 bg-accent text-accent-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity w-full sm:w-auto text-center"
              >
                Connect Calendar
              </a>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {settings.gmailConnected && (
              <DisconnectActionForm
                action={disconnectGmail}
                confirmText="Disconnect Gmail?"
                className="px-5 py-2.5 bg-background border border-destructive/20 text-destructive rounded-lg font-medium text-sm hover:bg-destructive/10 transition-colors w-full sm:w-auto"
              >
                Disconnect Gmail
              </DisconnectActionForm>
            )}
            {settings.calendarConnected && (
              <DisconnectActionForm
                action={disconnectCalendar}
                confirmText="Disconnect Calendar?"
                className="px-5 py-2.5 bg-background border border-destructive/20 text-destructive rounded-lg font-medium text-sm hover:bg-destructive/10 transition-colors w-full sm:w-auto"
              >
                Disconnect Calendar
              </DisconnectActionForm>
            )}
            {(settings.gmailConnected || settings.calendarConnected) && (
              <form action={disconnectAll}>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-background border border-border text-foreground rounded-lg font-medium text-sm hover:bg-surface-overlay transition-colors w-full sm:w-auto"
                >
                  Disconnect All
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Floating Bottom Bar */}
      <div className="bg-card border border-border rounded-2xl p-5 max-w-2xl w-full flex flex-col sm:flex-row items-center justify-between shadow-sm gap-4">
        <div>
          <h3 className="font-semibold text-foreground text-base mb-1">Onboarding Status</h3>
          <p className="text-sm text-muted-foreground">
            {canContinue
              ? (allConnected ? "All integrations active. You're ready to proceed!" : "Gmail connected. You can proceed or add Calendar.")
              : "Please connect your Gmail to continue."}
          </p>
        </div>

        <form action={continueToDashboard}>
          <button
            type="submit"
            disabled={!canContinue}
            className={`px-6 py-3 rounded-xl font-medium text-sm flex items-center justify-center transition-colors
              ${canContinue
                ? 'bg-accent text-accent-foreground hover:opacity-90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
          >
            Continue to Dashboard →
          </button>
        </form>
      </div>
    </div>
  )
}
