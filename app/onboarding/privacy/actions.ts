'use server'

import { auth } from '@clerk/nextjs/server'
import { db } from '@/server/db'
import { userSettings, users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

export async function acceptPrivacyPolicy() {
  const { userId } = await auth()
  const user = await currentUser()
  if (!userId || !user) return

  await db.insert(users).values({
    id: userId,
    email: user.primaryEmailAddress?.emailAddress ?? '',
    name: user.fullName,
    image: user.imageUrl,
  }).onConflictDoNothing()

  await db.insert(userSettings)
    .values({ userId, onboardingCompleted: true })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { onboardingCompleted: true }
    })
    
  redirect('/onboarding/connect')
}
