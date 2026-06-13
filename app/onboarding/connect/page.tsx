import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ensureCorsairTenant, createConnectLink } from '@/server/corsair/client'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export default async function ConnectPage({
  searchParams
}: {
  searchParams: { connected?: string; error?: string }
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // If Corsair redirected back with ?connected=true
  if (searchParams.connected === 'true') {
    // Mark user as connected in our DB
    await db.update(userSettings)
      .set({ gmailConnected: true, calendarConnected: true })
      .where(eq(userSettings.userId, userId))

    redirect('/inbox')
  }

  // Ensure Corsair tenant exists for this user
  await ensureCorsairTenant(userId)

  // Get current connection status
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { gmailConnected: true, calendarConnected: true },
  })

  // If already connected, go to inbox
  if (settings?.gmailConnected) redirect('/inbox')

  // Generate a connect link from Corsair
  const { url: connectUrl } = await createConnectLink(userId)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-sm w-full mx-auto p-10 bg-surface border border-border rounded-xl">
        <h1 className="font-display font-semibold text-2xl tracking-tight mb-1">
          Connect your accounts
        </h1>
        <p className="text-sm text-foreground-muted mb-8">
          Tempo uses Corsair to securely access your Gmail and Calendar.
          Your credentials are stored encrypted and never leave your control.
        </p>

        {searchParams.error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            Connection failed. Please try again.
          </div>
        )}

        <a
          href={connectUrl}
          className="block w-full h-11 bg-accent text-accent-foreground rounded-lg font-medium text-sm flex items-center justify-center hover:bg-accent-hover transition-colors"
        >
          Connect Gmail & Calendar →
        </a>

        <p className="text-xs text-foreground-subtle text-center mt-4">
          You'll be redirected to a secure Corsair page to authorize access.
        </p>

        {settings?.gmailConnected && (
          <a
            href="/inbox"
            className="block w-full mt-3 h-10 border border-border rounded-lg text-sm font-medium text-foreground flex items-center justify-center hover:bg-surface-overlay transition-colors"
          >
            Continue to inbox →
          </a>
        )}
      </div>
    </div>
  )
}

