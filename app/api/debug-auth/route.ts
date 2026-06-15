import { auth } from '@/auth'
import { db } from '@/server/db'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const session = await auth()
    
    let dbUser = null
    if (session?.user?.id) {
      dbUser = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, session.user!.id)
      })
    }

    return NextResponse.json({
      success: true,
      session,
      dbUserExists: !!dbUser,
      dbUser: dbUser,
      env: {
        nodeEnv: process.env.NODE_ENV,
        nextAuthUrl: process.env.NEXTAUTH_URL,
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
