'use server'

import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { saveSafeUserSettings } from '@/server/db/user-settings-compat'
import { invalidateSettingsCache } from '@/server/cache'
import { redis } from '@/server/redis'

export async function acceptPrivacyPolicy() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await saveSafeUserSettings(userId, { privacyConfigured: true, onboardingCompleted: true })
  await invalidateSettingsCache(redis, userId).catch(() => null)

  revalidatePath('/onboarding/privacy')
  revalidatePath('/inbox')
  revalidatePath('/dashboard')

  redirect('/inbox')
}
