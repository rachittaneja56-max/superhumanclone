import { getSession } from '@/lib/auth'
import { db } from '@/server/db'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    const userId = session.userId

    let dbUser = null
    if (userId) {
      try {
        dbUser = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.id, userId),
          columns: {
            id: true,
            email: true,
            name: true,
            role: true,
            isAdmin: true,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.includes(`column "role" does not exist`)) {
          throw error
        }

        dbUser = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.id, userId),
          columns: {
            id: true,
            email: true,
            name: true,
            isAdmin: true,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      userId,
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
