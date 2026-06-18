import 'server-only'

import { db } from '@/server/db'
import { sql } from 'drizzle-orm'

export type UsersColumnPresence = {
  hasRole: boolean
  hasIsAdmin: boolean
  hasPlan: boolean
  hasIsFlagged: boolean
  hasAiDisabled: boolean
  hasClerkUserId: boolean
}

let cachedPresence: Promise<UsersColumnPresence> | null = null

export async function getUsersColumnPresence(): Promise<UsersColumnPresence> {
  if (!cachedPresence) {
    cachedPresence = (async () => {
      const rows = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'users'
      `)

      const names = new Set(
        rows.rows.map((row: any) => String(row.column_name))
      )

      return {
        hasRole: names.has('role'),
        hasIsAdmin: names.has('isAdmin') || names.has('is_admin'),
        hasPlan: names.has('plan'),
        hasIsFlagged: names.has('isFlagged') || names.has('is_flagged'),
        hasAiDisabled: names.has('aiDisabled') || names.has('ai_disabled'),
        hasClerkUserId: names.has('clerk_user_id') || names.has('clerkUserId'),
      }
    })().catch((error) => {
      cachedPresence = null
      throw error
    })
  }

  return cachedPresence
}
