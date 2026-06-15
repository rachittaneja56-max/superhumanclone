import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getGmailAuthUrl, getCalendarAuthUrl, isUserConnected } from '@/server/corsair/client'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export default async function ConnectPage({
  searchParams
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // If Corsair redirected back with ?connected=true
  if (resolvedSearchParams.connected === 'true') {
    // Mark user as connected in our DB
    await db.update(userSettings)
      .set({ gmailConnected: true, calendarConnected: true })
      .where(eq(userSettings.userId, userId))

    redirect('/inbox')
  }

  // Get current connection status from local DB
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { gmailConnected: true, calendarConnected: true },
  })

  // If already connected, go to inbox
  if (settings?.gmailConnected) redirect('/inbox')

  // Check actual live connection status in Corsair DB (fallback if local DB is out of sync)
  const isActuallyConnected = await isUserConnected(userId, 'gmail')
  if (isActuallyConnected) {
    await db.update(userSettings)
      .set({ gmailConnected: true, calendarConnected: true })
      .where(eq(userSettings.userId, userId))
    redirect('/inbox')
  }

  // Generate connect links from Corsair
  let gmailConnectUrl: string = ''
  let calendarConnectUrl: string = ''
  let connectError: string | null = null

  try {
    // Ideally we would have a unified connect link, but for now we'll prioritize Gmail
    gmailConnectUrl = await getGmailAuthUrl(userId)
    calendarConnectUrl = await getCalendarAuthUrl(userId)
  } catch (err: any) {
    console.error('getAuthUrl FAILED:', err?.message, err?.stack)
    connectError = err?.message ?? 'Unknown error'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-sm w-full mx-auto p-10 bg-surface border border-border rounded-xl">
        <h1 className="font-display font-semibold text-2xl tracking-tight mb-1">
          Connect your accounts
        </h1>
        <p className="text-sm text-foreground-muted mb-8">
          Aethra uses Corsair to securely access your Gmail and Calendar.
          Your credentials are stored encrypted and never leave your control.
        </p>

        {resolvedSearchParams.error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            Connection failed. Please try again.
          </div>
        )}

        <div className="space-y-3">
          <a
            href={gmailConnectUrl}
            className="block w-full h-11 bg-accent text-accent-foreground rounded-lg font-medium text-sm flex items-center justify-center hover:bg-accent-hover transition-colors"
          >
            Connect Gmail →
          </a>
          <a
            href={calendarConnectUrl}
            className="block w-full h-11 bg-surface-overlay text-foreground border border-border rounded-lg font-medium text-sm flex items-center justify-center hover:bg-surface-elevated transition-colors"
          >
            Connect Google Calendar →
          </a>
        </div>

        <p className="text-xs text-foreground-subtle text-center mt-4">
          You&apos;ll be redirected to a secure Google OAuth page to authorize access.
        </p>

        {settings?.gmailConnected && (
          <Link
            href="/inbox"
            className="block w-full mt-3 h-10 border border-border rounded-lg text-sm font-medium text-foreground flex items-center justify-center hover:bg-surface-overlay transition-colors"
          >
            Continue to inbox →
          </Link>
        )}
      </div>
    </div>
  )
}
