import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ensureCorsairTenant, createConnectLink } from '@/server/corsair/client'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const params = await searchParams

  // If Corsair redirected back with ?connected=true
  if (params.connected === 'true') {
    await db.update(userSettings)
      .set({ gmailConnected: true, calendarConnected: true })
      .where(eq(userSettings.userId, userId))
    redirect('/inbox')
  }

  // Get current connection status
  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { gmailConnected: true, calendarConnected: true },
  })

  // If already connected, go to inbox
  if (settings?.gmailConnected) redirect('/inbox')

  // Ensure Corsair tenant exists for this user
  await ensureCorsairTenant(userId)

  // Generate a connect link from Corsair
  const { url: connectUrl } = await createConnectLink(userId)

  return (
    <div className="flex min-h-screen w-full items-center justify-center relative bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />

      <div className="relative z-10 w-full max-w-sm mx-auto bg-surface border border-border rounded-[16px] p-[40px] px-[36px] shadow-sm">

        <div className="flex flex-col items-start mb-6">
          <h2 className="font-display font-semibold text-xl text-foreground">
            Connect your accounts
          </h2>
          <p className="text-sm text-foreground-muted mt-1">
            Tempo uses Corsair to securely access your Gmail and Calendar.
            Your credentials are never stored on our servers.
          </p>
        </div>

        {params.error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            Connection failed. Please try again.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* Gmail */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-foreground">Gmail</p>
              <p className="text-xs text-foreground-muted">Read and manage your emails</p>
            </div>
          </div>

          {/* Calendar */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
            <svg className="w-5 h-5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-foreground">
                Google Calendar
                <span className="text-[10px] bg-border/50 px-1 py-0.5 rounded text-foreground-muted ml-1">(Optional)</span>
              </p>
              <p className="text-xs text-foreground-muted">Manage your schedule</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <a
            href={connectUrl}
            className="flex w-full items-center justify-center h-11 rounded-lg bg-accent text-accent-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Connect Gmail &amp; Calendar →
          </a>
          <p className="text-xs text-foreground-muted text-center mt-3">
            You&apos;ll be redirected to a secure Corsair page to authorize access.
          </p>
        </div>
      </div>
    </div>
  )
}
