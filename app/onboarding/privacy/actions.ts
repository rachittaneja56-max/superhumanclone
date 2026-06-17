'use server'

import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { saveSafeUserSettings } from '@/server/db/user-settings-compat'

export async function acceptPrivacyPolicy() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await saveSafeUserSettings(userId, { privacyConfigured: true })

  redirect('/onboarding/connect')
}
