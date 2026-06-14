import 'server-only'
import { createClient } from '@corsair-dev/app'

if (!process.env.CORSAIR_DEV_KEY) {
  throw new Error('CORSAIR_DEV_KEY is not set. Get it from app.corsair.dev/api-keys')
}
if (!process.env.CORSAIR_INSTANCE_ID) {
  throw new Error('CORSAIR_INSTANCE_ID is not set. Run setup.ts first.')
}

const corsairApp = createClient({ apiKey: process.env.CORSAIR_DEV_KEY })
const corsairInstance = corsairApp.instance(process.env.CORSAIR_INSTANCE_ID)

export { corsairInstance }

// Ensure a Corsair tenant exists for this user
// Idempotent — safe to call on every request
export async function ensureCorsairTenant(userId: string) {
  try {
    return await corsairInstance.tenant(userId).get()
  } catch {
    return corsairInstance.tenants.create(userId)
  }
}

// Get tenant-scoped client — this is the main entry point
export function getCorsairTenant(userId: string) {
  return corsairInstance.tenant(userId)
}

// Generate a connect link for the user
// Returns { url, token, expiresAt, ttlMs }
export async function createConnectLink(userId: string) {
  const t = getCorsairTenant(userId)
  return t.connectLink.create({
    plugins: ['gmail', 'googlecalendar'],
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  })
}

// ── Gmail — Read from synced DB (fast, no rate limits) ───────────
// Use .db.* for UI feeds. Use .api.* only for writes and explicit resync.

export async function getEmails(userId: string, params?: {
  limit?: number
  offset?: number
}) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.db.messages.search', {
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, signInLink: null, data: result.data }
}

export async function getThread(userId: string, threadId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.db.messages.search', {
    data: { threadId: { equals: threadId } },
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, signInLink: null, data: result.data }
}

// Resync: pull fresh emails from Gmail into Corsair's DB
// Call after initial connect and on explicit "Refresh" button
export async function syncGmailInbox(userId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.list', {
    maxResults: 100,
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink }
  }
  return { needsConnect: false, synced: true }
}

// ── Gmail — Writes (always use .api.*) ───────────────────────────

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
  return { needsConnect: false, signInLink: null, data: result.data }
}

export async function archiveEmail(userId: string, messageId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.modify', {
    id: messageId,
    removeLabelIds: ['INBOX'],
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink }
  }
  return { needsConnect: false }
}

export async function markEmailRead(userId: string, messageId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.modify', {
    id: messageId,
    removeLabelIds: ['UNREAD'],
  })
  if (!result.success) return { needsConnect: true }
  return { needsConnect: false }
}

export async function deleteEmail(userId: string, messageId: string) {
  const t = getCorsairTenant(userId)
  const result = await t.run('gmail.api.messages.trash', {
    id: messageId,
  })
  if (!result.success) return { needsConnect: true }
  return { needsConnect: false }
}

// ── Calendar — Read from synced DB ───────────────────────────────

export async function getCalendarEvents(userId: string, params?: {
  limit?: number
}) {
  const t = getCorsairTenant(userId)
  const result = await t.run('googlecalendar.db.events.search', {
    limit: params?.limit ?? 50,
  })
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null }
  }
  return { needsConnect: false, signInLink: null, data: result.data }
}

// ── Calendar — Writes ─────────────────────────────────────────────

export async function createCalendarEvent(userId: string, event: {
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  description?: string
}) {
  const t = getCorsairTenant(userId)
  // Replaced .insert with .create to match the actual API catalog path for googlecalendar
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
  return { needsConnect: false, signInLink: null, data: result.data }
}

// ── MCP client for agent (Vercel AI SDK) ─────────────────────────

export async function createCorsairMCPClient(userId: string) {
  // Creates a Vercel AI SDK compatible MCP client
  // MUST call await mcpClient.tools() before using in streamText
  // MUST call await mcpClient.close?.() after use
  const t = getCorsairTenant(userId)
  return t.mcp.createVercelClient()
}
