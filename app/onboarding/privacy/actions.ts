'use server'

import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { redirect } from 'next/navigation'

export async function acceptPrivacyPolicy() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return

  await db.insert(userSettings)
    .values({ userId, privacyConfigured: true })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { privacyConfigured: true }
    })
    
  redirect('/onboarding/connect')
}
