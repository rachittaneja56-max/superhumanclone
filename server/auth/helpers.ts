// server/auth/helpers.ts
import 'server-only'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export async function ensureUserSettings(userId: string): Promise<void> {
  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { userId: true },
  })

  if (!existing) {
    await db.insert(userSettings).values({
      userId,
      onboardingCompleted: false,
      gmailConnected: false,
      calendarConnected: false,
    }).onConflictDoNothing()
  }
}

export async function expireUserHITLActions(userId: string): Promise<void> {
  const { hitlActions } = await import('@/server/db/schema')
  const { eq, and } = await import('drizzle-orm')
  await db.update(hitlActions)
    .set({ status: 'expired' })
    .where(
      and(
        eq(hitlActions.userId, userId),
        eq(hitlActions.status, 'pending')
      )
    )
}
