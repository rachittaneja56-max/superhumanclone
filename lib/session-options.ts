import type { SessionOptions } from 'iron-session'

export interface SessionData {
  userId?: string
  adminUnlocked?: boolean
}

export const sessionOptions: SessionOptions = {
  password: process.env.ENCRYPTION_KEY || 'complex_password_at_least_32_characters_long',
  cookieName: 'aethra_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  },
}
