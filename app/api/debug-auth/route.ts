import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { getUsersColumnPresence } from '@/server/db/users-compat'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getSession()
    const userId = session.userId
    const clerkUserId = session.clerkUserId ?? null
    const clerkSessionId = session.clerkSessionId ?? null

    let dbUser = null
    if (userId) {
      const columns = await getUsersColumnPresence()
      dbUser = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
        columns: {
          id: true,
          email: true,
          name: true,
          ...(columns.hasRole ? { role: true } : {}),
          ...(columns.hasIsAdmin ? { isAdmin: true } : {}),
        },
      })
    }

    return NextResponse.json({
      success: true,
      userId,
      clerkUserId,
      clerkSessionId,
      dbUserExists: !!dbUser,
      dbUser: dbUser,
      env: {
        nodeEnv: process.env.NODE_ENV,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
      }
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
