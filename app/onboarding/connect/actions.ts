'use server'

import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { disconnectIntegration } from '@/server/corsair/client'
import { eq } from 'drizzle-orm'
import { invalidateMailCache, invalidateSettingsCache } from '@/server/cache'
import { redis } from '@/server/redis'

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

async function disconnectAndRefresh(integration: 'gmail' | 'googlecalendar', redirectTo: string) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await disconnectIntegration(userId, integration)
  await db.update(userSettings)
    .set({
      ...(integration === 'gmail' ? { gmailConnected: false } : {}),
      ...(integration === 'googlecalendar' ? { calendarConnected: false } : {}),
    })
    .where(eq(userSettings.userId, userId))

  await invalidateSettingsCache(redis, userId).catch(() => null)
  await invalidateMailCache(redis, userId).catch(() => null)
  await revalidatePath('/onboarding/connect')
  await revalidatePath('/inbox')
  await revalidatePath('/calendar')

  return { success: true, redirectTo }
}

export async function disconnectGmail() {
  return disconnectAndRefresh('gmail', '/onboarding/connect?disconnected=gmail')
}

export async function disconnectCalendar() {
  return disconnectAndRefresh('googlecalendar', '/onboarding/connect?disconnected=calendar')
}

export async function disconnectAll() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await disconnectIntegration(userId, 'gmail')
  await disconnectIntegration(userId, 'googlecalendar')

  await db.update(userSettings)
    .set({
      gmailConnected: false,
      calendarConnected: false
    })
    .where(eq(userSettings.userId, userId))

  await invalidateSettingsCache(redis, userId).catch(() => null)
  await invalidateMailCache(redis, userId).catch(() => null)
  revalidatePath('/onboarding/connect')
  revalidatePath('/inbox')
  revalidatePath('/calendar')
  return { success: true, redirectTo: '/onboarding/connect?disconnected=all' }
}
