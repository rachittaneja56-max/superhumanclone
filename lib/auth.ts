import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  userId?: string
  adminUnlocked?: boolean
}

export const sessionOptions = {
  password: process.env.ENCRYPTION_KEY || 'complex_password_at_least_32_characters_long',
  cookieName: 'aethra_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
}

export async function getSession() {
  return await getIronSession<SessionData>(await cookies(), sessionOptions)
}

export async function setSession(userId: string) {
  const session = await getSession()
  session.userId = userId
  await session.save()
}

export async function setAdminUnlocked(adminUnlocked: boolean) {
  const session = await getSession()
  session.adminUnlocked = adminUnlocked
  await session.save()
}

export async function destroySession() {
  const session = await getSession()
  session.destroy()
}

export async function requireAuth() {
  const session = await getSession()
  if (!session.userId) {
    throw new Error('Unauthorized')
  }
  return session.userId
}
