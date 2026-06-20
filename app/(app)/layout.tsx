import { redirect } from 'next/navigation'

import { getSession } from '@/lib/auth'
import { AppClientShell } from '@/components/app-client-shell'
import { AgentContextEntry } from '@/components/agent/AgentContextEntry'
import { UnifiedSidebar } from '@/components/app/UnifiedSidebar'
import { WorkspaceFrame } from '@/components/app/WorkspaceFrame'
import { getUserAdminState } from '@/server/admin/access'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { getSafeUserSettings } from '@/server/db/user-settings-compat'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'
import { redis } from '@/server/redis'
import { settingsCacheKey, settingsVersionKey } from '@/server/cache'

async function getCachedUserSettings(userId: string) {
  try {
    const version = Number((await redis.get<string>(settingsVersionKey(userId))) ?? '0')
    const cacheKey = settingsCacheKey(userId, version)
    const cached = await redis.get<string>(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch {
    // Redis unavailable - fall through to DB
  }
  return getSafeUserSettings(userId)
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const userId = session.userId

  if (!userId) redirect('/login')

  const [localUser, settings, adminState, connectionState] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, name: true },
    }),
    getCachedUserSettings(userId),
    getUserAdminState(userId),
    reconcileGoogleConnectionState(userId).catch(() => ({
      gmailConnected: false,
      calendarConnected: false,
    })),
  ])

  if (!localUser) {
    redirect('/login')
  }

  if (!settings.hasRecord || !connectionState.gmailConnected || !connectionState.calendarConnected) {
    redirect('/onboarding/connect')
  }

  if (!settings.privacyConfigured || !settings.onboardingCompleted) {
    redirect('/onboarding/privacy')
  }

  const email = localUser.email ?? ''
  const name = localUser.name ?? 'User'
  const firstName = name.split(' ')[0] || 'User'
  const { isAdmin } = adminState

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <UnifiedSidebar firstName={firstName} email={email} isAdmin={isAdmin} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AgentContextEntry />
        <WorkspaceFrame>{children}</WorkspaceFrame>
      </main>

      <AppClientShell userId={userId} />
    </div>
  )
}
