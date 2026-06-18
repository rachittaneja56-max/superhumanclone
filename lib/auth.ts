import 'server-only'

import { auth } from '@clerk/nextjs/server'

import { clearAdminSessionUnlocked, isAdminSessionUnlocked, markAdminSessionUnlocked } from '@/server/auth/admin-unlock'
import { ensureLocalUserForClerk } from '@/server/auth/local-user'

export type SessionData = {
  userId?: string
  adminUnlocked?: boolean
  clerkUserId?: string
  clerkSessionId?: string
}

export async function getSession(): Promise<SessionData> {
  const { userId: clerkUserId, sessionId: clerkSessionId } = await auth()

  if (!clerkUserId) {
    return {}
  }

  const [userId, adminUnlocked] = await Promise.all([
    ensureLocalUserForClerk(clerkUserId),
    isAdminSessionUnlocked(clerkSessionId),
  ])

  return {
    userId,
    adminUnlocked,
    clerkUserId,
    clerkSessionId: clerkSessionId ?? undefined,
  }
}

export async function setAdminUnlocked(adminUnlocked: boolean) {
  const { sessionId } = await auth()
  if (!sessionId) return

  if (adminUnlocked) {
    await markAdminSessionUnlocked(sessionId)
    return
  }

  await clearAdminSessionUnlocked(sessionId)
}

export async function destroySession() {
  const { sessionId } = await auth()
  await clearAdminSessionUnlocked(sessionId)
}

export async function requireAuth() {
  const session = await getSession()
  if (!session.userId) {
    throw new Error('Unauthorized')
  }
  return session.userId
}
