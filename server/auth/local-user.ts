import 'server-only'

import { currentUser } from '@clerk/nextjs/server'
import { eq, sql } from 'drizzle-orm'

import { normalizeEmail, resolveUserRole } from '@/server/admin/access-utils'
import { ensureUserSettings } from '@/server/auth/helpers'
import { ensureTenantProvisioned } from '@/server/corsair/provision'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { getUsersColumnPresence } from '@/server/db/users-compat'
import { redis } from '@/server/redis'

// Cache the Clerk → local user ID mapping for 24 hours.
// This is safe because the mapping never changes after creation.
const LOCAL_USER_CACHE_TTL = 60 * 60 * 24

function localUserCacheKey(clerkUserId: string) {
  return `auth:clerk-to-local:${clerkUserId}`
}

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
  // Fast path: check Redis cache first (avoids DB round-trip on every request)
  try {
    const cached = await redis.get<string>(localUserCacheKey(clerkUserId))
    if (cached) {
      return cached
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  const columns = await getUsersColumnPresence()

  if (columns.hasClerkUserId) {
    const existingByClerkId = await db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
      columns: { id: true },
    })

    if (existingByClerkId) {
      await ensureUserSettings(existingByClerkId.id)
      // Warm the cache for future requests
      await redis.set(localUserCacheKey(clerkUserId), existingByClerkId.id, { ex: LOCAL_USER_CACHE_TTL }).catch(() => null)
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
    // Warm the cache
    await redis.set(localUserCacheKey(clerkUserId), existingByEmail.id, { ex: LOCAL_USER_CACHE_TTL }).catch(() => null)
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

  const upsertColumns: Array<{ column: string; value: unknown }> = [
    { column: "id", value: insertValues.id },
    { column: "email", value: insertValues.email },
    { column: "name", value: insertValues.name },
    { column: "image", value: insertValues.image },
  ]

  if (profile.emailVerified) {
    upsertColumns.push({ column: "email_verified", value: profile.emailVerified })
  }

  if (columns.hasClerkUserId) {
    upsertColumns.push({ column: "clerk_user_id", value: profile.clerkUserId })
  }

  if (columns.hasRole) {
    upsertColumns.push({ column: "role", value: profile.role })
  }

  if (columns.hasIsAdmin) {
    upsertColumns.push({ column: "isAdmin", value: profile.isAdmin })
  }

  const updateAssignments = upsertColumns
    .filter(({ column }) => column !== "id" && column !== "email")
    .map(({ column }) => sql.raw(`"${column}" = excluded."${column}"`))

  await db.execute(sql`
    insert into "users" (${sql.raw(upsertColumns.map(({ column }) => `"${column}"`).join(", "))})
    values (${sql.join(upsertColumns.map(({ value }) => sql`${value}`), sql`, `)})
    on conflict ("email") do update set ${sql.join(updateAssignments, sql`, `)}
  `)

  const upsertedUser = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${profile.email}`,
    columns: { id: true },
  })

  const userId = String(upsertedUser?.id ?? "")
  if (!userId) {
    throw new Error('local_user_upsert_failed')
  }

  await Promise.all([
    ensureTenantProvisioned(userId),
    ensureUserSettings(userId),
  ])

  // Warm the cache for new users
  await redis.set(localUserCacheKey(clerkUserId), userId, { ex: LOCAL_USER_CACHE_TTL }).catch(() => null)

  return userId
}

