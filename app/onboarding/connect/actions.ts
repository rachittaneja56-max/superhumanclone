'use server'

import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { disconnectIntegration } from '@/server/corsair/client'
import { invalidateMailCache, invalidateSettingsCache } from '@/server/cache'
import { redis } from '@/server/redis'
import { saveSafeUserSettings } from '@/server/db/user-settings-compat'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'

export async function continueToDashboard() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  const { gmailConnected } = await reconcileGoogleConnectionState(userId).catch(() => ({
    gmailConnected: false,
  }))

  if (!gmailConnected) {
    redirect('/onboarding/connect?error=gmail_required')
  }

  await saveSafeUserSettings(userId, { onboardingCompleted: true })

  redirect('/dashboard')
}

async function disconnectAndRefresh(integration: 'gmail' | 'googlecalendar', redirectTo: string) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await disconnectIntegration(userId, integration)
  await saveSafeUserSettings(userId, {
    ...(integration === 'gmail' ? { gmailConnected: false } : {}),
    ...(integration === 'googlecalendar' ? { calendarConnected: false } : {}),
  })

  await invalidateSettingsCache(redis, userId).catch(() => null)
  await invalidateMailCache(redis, userId).catch(() => null)
  await revalidatePath('/onboarding/connect')
  await revalidatePath('/dashboard')
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

  await saveSafeUserSettings(userId, {
    gmailConnected: false,
    calendarConnected: false
  })

  await invalidateSettingsCache(redis, userId).catch(() => null)
  await invalidateMailCache(redis, userId).catch(() => null)
  revalidatePath('/onboarding/connect')
  revalidatePath('/dashboard')
  revalidatePath('/inbox')
  revalidatePath('/calendar')
  return { success: true, redirectTo: '/onboarding/connect?disconnected=all' }
}
