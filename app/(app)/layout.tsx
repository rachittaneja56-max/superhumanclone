import { redirect } from 'next/navigation'
import { AppClientShell } from '@/components/app-client-shell'
import { UnifiedSidebar } from '@/components/app/UnifiedSidebar'
import { WorkspaceFrame } from '@/components/app/WorkspaceFrame'
import { getUserAdminState } from '@/server/admin/access'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { getSafeUserSettings } from '@/server/db/user-settings-compat'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const userId = session.userId

  if (!userId) redirect('/login')

  const localUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      email: true,
      name: true,
    },
  })

  if (!localUser) {
    redirect('/login')
  }

  const settings = await getSafeUserSettings(userId)

  if (!settings.hasRecord || !settings.onboardingCompleted) {
    redirect('/onboarding/connect')
  }

  const email = localUser.email ?? ''
  const name = localUser.name ?? 'User'
  const firstName = name.split(' ')[0] || 'User'
  const { isAdmin } = await getUserAdminState(userId)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <UnifiedSidebar firstName={firstName} email={email} isAdmin={isAdmin} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceFrame>{children}</WorkspaceFrame>
      </main>

      <AppClientShell userId={userId} />
    </div>
  )
}
