'use server'

import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { redirect } from 'next/navigation'
import { disconnectIntegration } from '@/server/corsair/client'
import { eq } from 'drizzle-orm'

export async function continueToDashboard() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await db.insert(userSettings)
    .values({ userId, onboardingCompleted: true })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { onboardingCompleted: true }
    })
    
  redirect('/inbox')
}

export async function handleDisconnect(integration: 'gmail' | 'calendar') {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  // Mock disconnect logic (ideal: call corsair.deleteTenant or similar)
  await disconnectIntegration(userId, integration)

  // Update local settings
  await db.update(userSettings)
    .set({
      ...(integration === 'gmail' ? { gmailConnected: false } : { calendarConnected: false })
    })
    .where(eq(userSettings.userId, userId))
}
