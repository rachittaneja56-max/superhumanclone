import 'server-only'

import { currentUser } from '@clerk/nextjs/server'
import { eq, sql } from 'drizzle-orm'

import { normalizeEmail, resolveUserRole } from '@/server/admin/access-utils'
import { ensureUserSettings } from '@/server/auth/helpers'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { getUsersColumnPresence } from '@/server/db/users-compat'

type ClerkProfile = {
  clerkUserId: string
  email: string
  name: string | null
  image: string | null
  emailVerified: Date | null
  role: 'user' | 'admin' | 'superadmin'
  isAdmin: boolean
}

function buildClerkProfile(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): ClerkProfile {
  const primaryEmail = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress
  if (!primaryEmail) {
    throw new Error('clerk_missing_primary_email')
  }

  const email = normalizeEmail(primaryEmail)
  const role = resolveUserRole({ email, role: 'user' })
  const name =
    user.fullName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    null

  return {
    clerkUserId: user.id,
    email,
    name,
    image: user.imageUrl ?? null,
    emailVerified: user.primaryEmailAddress?.verification?.status === 'verified' ? new Date() : null,
    role,
    isAdmin: role !== 'user',
  }
}

export async function ensureLocalUserForClerk(clerkUserId: string) {
  const columns = await getUsersColumnPresence()

  if (columns.hasClerkUserId) {
    const existingByClerkId = await db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
      columns: { id: true },
    })

    if (existingByClerkId) {
      await ensureUserSettings(existingByClerkId.id)
      return existingByClerkId.id
    }
  }

  const clerkUser = await currentUser()
  if (!clerkUser) {
    throw new Error('clerk_user_not_available')
  }

  const profile = buildClerkProfile(clerkUser)

  const existingByEmail = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${profile.email}`,
    columns: { id: true },
  })

  if (existingByEmail) {
    const updateValues: Record<string, unknown> = {
      name: profile.name,
      image: profile.image,
    }

    if (profile.emailVerified) {
      updateValues.emailVerified = profile.emailVerified
    }

    if (columns.hasClerkUserId) {
      updateValues.clerkUserId = profile.clerkUserId
    }

    await db.update(users).set(updateValues).where(eq(users.id, existingByEmail.id))
    await ensureUserSettings(existingByEmail.id)
    return existingByEmail.id
  }

  const insertValues: typeof users.$inferInsert = {
    id: crypto.randomUUID(),
    email: profile.email,
    name: profile.name,
    image: profile.image,
    ...(profile.emailVerified ? { emailVerified: profile.emailVerified } : {}),
    ...(columns.hasClerkUserId ? { clerkUserId: profile.clerkUserId } : {}),
    ...(columns.hasRole ? { role: profile.role } : {}),
    ...(columns.hasIsAdmin ? { isAdmin: profile.isAdmin } : {}),
  }

  const updateValues: Partial<typeof users.$inferInsert> = {
    name: profile.name,
    image: profile.image,
    ...(profile.emailVerified ? { emailVerified: profile.emailVerified } : {}),
    ...(columns.hasClerkUserId ? { clerkUserId: profile.clerkUserId } : {}),
  }

  const [upsertedUser] = await db
    .insert(users)
    .values(insertValues)
    .onConflictDoUpdate({
      target: users.email,
      set: updateValues,
    })
    .returning({ id: users.id })

  const userId = String(upsertedUser?.id ?? '')
  if (!userId) {
    throw new Error('local_user_upsert_failed')
  }

  await Promise.all([
    ensureTenantProvisioned(userId),
    ensureUserSettings(userId),
  ])

  return userId
}
