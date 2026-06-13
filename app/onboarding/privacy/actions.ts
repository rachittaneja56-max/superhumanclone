'use server'

import { auth } from '@/auth'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export async function acceptPrivacyPolicy() {
  const session = await auth()
  if (!session?.user?.id) return

  await db.update(userSettings)
    .set({ onboardingCompleted: true })
    .where(eq(userSettings.userId, session.user.id))
    
  redirect('/onboarding/connect')
}
