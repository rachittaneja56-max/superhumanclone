import 'server-only'
import { createClient, type PluginId } from '@corsair-dev/app'

// Validate required env vars on module load
if (!process.env.CORSAIR_DEV_KEY) {
  throw new Error(
    'MISSING: CORSAIR_DEV_KEY not set in environment variables. ' +
    'Get it from app.corsair.dev/api-keys'
  )
}
if (!process.env.CORSAIR_INSTANCE_ID) {
  throw new Error(
    'MISSING: CORSAIR_INSTANCE_ID not set. ' +
    'Run: npx tsx server/corsair/setup.ts to create an instance first.'
  )
}

// Single Corsair client for the whole app
// CORSAIR_DEV_KEY from app.corsair.dev/api-keys
const corsairApp = createClient({
  apiKey: process.env.CORSAIR_DEV_KEY!,
})

// The single Corsair instance for Tempo
// CORSAIR_INSTANCE_ID is set after running setupInstance() once
export const corsairInstance = corsairApp.instance(
  process.env.CORSAIR_INSTANCE_ID!
)

// Get a tenant-scoped client for a specific Tempo user
// userId from Auth.js session — this IS the tenant ID
export function getCorsairTenant(userId: string) {
  console.log('[Corsair] Getting tenant for userId:', userId.slice(0, 8) + '...')
  const tenant = corsairInstance.tenant(userId)
  console.log('[Corsair] Tenant object type:', typeof tenant)
  return tenant
}

// Ensure a Corsair tenant exists for this user
// Call this on first sign-in, idempotent
export async function ensureCorsairTenant(userId: string) {
  try {
    // Try to get existing tenant
    return await corsairInstance.tenant(userId).get()
  } catch {
    // Create if doesn't exist
    return await corsairInstance.tenants.create(userId)
  }
}

// Generate a connect link for the user to connect Gmail + Calendar
// Returns a URL — redirect the user to it
export async function createConnectLink(
  userId: string,
  options?: { plugins?: string[]; ttlMs?: number }
) {
  const tenant = getCorsairTenant(userId)
  const result = await tenant.connectLink.create({
    plugins: (options?.plugins ?? ['gmail', 'googlecalendar']) as PluginId[],
    ttlMs: options?.ttlMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days default
  })
  console.log('[Corsair] Connect link created:', typeof result, Object.keys(result ?? {}))
  return result
}

// ── Gmail Operations ──────────────────────────────────────────────

export async function getEmails(userId: string, params?: {
  limit?: number
  offset?: number
  query?: string
}) {
  const t = getCorsairTenant(userId)
  // Read from Corsair's synced DB (fast, no rate limits)
  const result = await t.run('gmail.db.messages.search', {
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
  })
  if (!result.success) {
    // User hasn't connected Gmail yet
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, data: result.data }
}

export async function getThread(userId: string, threadId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.db.messages.search', {
    data: { threadId: { equals: threadId } },
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, data: result.data }
}

export async function sendEmail(userId: string, payload: {
  to: string[]
  subject: string
  body: string
  threadId?: string
}) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.send', {
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
    ...(payload.threadId && { threadId: payload.threadId }),
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, data: result.data }
}

export async function archiveEmail(userId: string, messageId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.archive', {
    messageId,
  })
  if (!result.success) throw new Error('Failed to archive: ' + result.signInLink)
  return result.data
}

export async function syncGmailInbox(userId: string) {
  // Pull latest emails from Gmail API into Corsair's DB
  // Call this on first connect and periodically
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.list', {
    maxResults: 100,
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink }
  }
  return { needsConnect: false, synced: true }
}

// ── Calendar Operations ───────────────────────────────────────────

export async function getCalendarEvents(userId: string, params?: {
  timeMin?: string
  timeMax?: string
}) {
  const t = getCorsairTenant(userId)
  const result = await t.run('googlecalendar.db.events.search', {
    limit: 50,
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, data: result.data }
}

export async function createCalendarEvent(userId: string, event: {
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  description?: string
}) {
  const t = getCorsairTenant(userId)
  const result = await t.run('googlecalendar.api.events.create', {
    summary: event.title,
    start: { dateTime: event.startTime },
    end: { dateTime: event.endTime },
    attendees: event.attendees.map(email => ({ email })),
    ...(event.description && { description: event.description }),
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, data: result.data }
}
