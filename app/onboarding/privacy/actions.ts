'use server'

import { auth } from '@clerk/nextjs/server'
import { db } from '@/server/db'
import { userSettings } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export async function acceptPrivacyPolicy() {
  const { userId } = await auth()
  if (!userId) return

  await db.update(userSettings)
    .set({ onboardingCompleted: true })
    .where(eq(userSettings.userId, userId))
    
  redirect('/onboarding/connect')
}
