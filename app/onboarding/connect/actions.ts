'use server'

import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { disconnectIntegration } from '@/server/corsair/client'
import { invalidateMailCache, invalidateSettingsCache, invalidateConnectionCache } from '@/server/cache'
import { redis } from '@/server/redis'
import { saveSafeUserSettings } from '@/server/db/user-settings-compat'
import { reconcileGoogleConnectionState } from '@/server/auth/helpers'

export async function continueToDashboard() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  const { gmailConnected, calendarConnected } = await reconcileGoogleConnectionState(userId).catch(() => ({
    gmailConnected: false,
    calendarConnected: false,
  }))

  if (!gmailConnected || !calendarConnected) {
    redirect('/onboarding/connect?error=workspace_required')
  }

  await saveSafeUserSettings(userId, {
    onboardingCompleted: true,
    gmailConnected: true,
    calendarConnected: true,
  })

  await Promise.all([
    invalidateSettingsCache(redis, userId),
    invalidateConnectionCache(redis, userId),
  ]).catch(() => null)
  revalidatePath('/onboarding/connect')
  revalidatePath('/dashboard')

  redirect('/onboarding/privacy')
}

async function disconnectAndRefresh(integration: 'gmail' | 'googlecalendar', redirectTo: string) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  const result = await disconnectIntegration(userId, integration)
  if (!result.success) {
    throw new Error(result.reason)
  }
  await saveSafeUserSettings(userId, {
    ...(integration === 'gmail' ? { gmailConnected: false } : {}),
    ...(integration === 'googlecalendar' ? { calendarConnected: false } : {}),
  })

  await Promise.all([
    invalidateSettingsCache(redis, userId),
    invalidateMailCache(redis, userId),
    invalidateConnectionCache(redis, userId),
  ]).catch(() => null)
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

  const [gmailResult, calendarResult] = await Promise.all([
    disconnectIntegration(userId, 'gmail'),
    disconnectIntegration(userId, 'googlecalendar'),
  ])

  if (!gmailResult.success) {
    throw new Error(gmailResult.reason)
  }
  if (!calendarResult.success) {
    throw new Error(calendarResult.reason)
  }

  await saveSafeUserSettings(userId, {
    gmailConnected: false,
    calendarConnected: false
  })

  await Promise.all([
    invalidateSettingsCache(redis, userId),
    invalidateMailCache(redis, userId),
    invalidateConnectionCache(redis, userId),
  ]).catch(() => null)
  revalidatePath('/onboarding/connect')
  revalidatePath('/dashboard')
  revalidatePath('/inbox')
  revalidatePath('/calendar')
  return { success: true, redirectTo: '/onboarding/connect?disconnected=all' }
}
