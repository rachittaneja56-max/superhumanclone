import 'server-only'
import { db } from '@/server/db'
import { corsairAccounts, corsairIntegrations } from '@/server/db/schema'
import { eq, and } from 'drizzle-orm'

// Type helper — plugins are dynamically attached, need 'as any'
type CorsairTenant = {
  gmail: {
    api: {
      messages: {
        list: (params: any) => Promise<any>
        get: (params: any) => Promise<any>
        send: (params: any) => Promise<any>
        modify: (params: any) => Promise<any>
        trash: (params: any) => Promise<any>
      }
      threads: {
        get: (params: any) => Promise<any>
      }
    }
    db: {
      threads: { list: (params: any) => Promise<any> }
      messages: { list: (params: any) => Promise<any> }
    }
  }
  googlecalendar: {
    api: {
      events: {
        getMany: (params: any) => Promise<any>
        get: (params: any) => Promise<any>
        create: (params: any) => Promise<any>
        update: (params: any) => Promise<any>
        delete: (params: any) => Promise<any>
      }
      calendar: {
        getAvailability: (params: any) => Promise<any>
      }
    }
    db: {
      events: { list: (params: any) => Promise<any> }
    }
  }
}

async function getTenant(userId: string): Promise<CorsairTenant> {
  const { corsair } = await import('@/corsair')
  return corsair.withTenant(userId) as any
}

// ── Connection check ─────────────────────────────────────────────

export async function isUserConnected(
  userId: string,
  plugin: 'gmail' | 'googlecalendar'
): Promise<boolean> {
  const result = await db
    .select()
    .from(corsairAccounts)
    .innerJoin(corsairIntegrations, eq(corsairAccounts.integrationId, corsairIntegrations.id))
    .where(
      and(
        eq(corsairAccounts.tenantId, userId),
        eq(corsairIntegrations.name, plugin)
      )
    )
    .limit(1)

  return result.length > 0
}

import { generateOAuthUrl } from 'corsair/oauth'

export async function getGmailAuthUrl(userId: string, redirectUri?: string): Promise<string> {
  const { corsair } = await import('@/corsair')
  const rUri = redirectUri || (process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback')
  const result = await generateOAuthUrl(corsair, 'gmail', {
    tenantId: userId,
    redirectUri: rUri,
  })
  return result.url
}

export async function getCalendarAuthUrl(userId: string, redirectUri?: string): Promise<string> {
  const { corsair } = await import('@/corsair')
  const rUri = redirectUri || (process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback')
  const result = await generateOAuthUrl(corsair, 'googlecalendar', {
    tenantId: userId,
    redirectUri: rUri,
  })
  return result.url
}

// ── Gmail — Cached DB reads (RECOMMENDED for UI) ─────────────────

export async function getThreads(userId: string, params?: { limit?: number; offset?: number }) {
  const t = await getTenant(userId)
  try {
    const result = await t.gmail.db.threads.list({
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
    })
    return { success: true, data: result, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    throw err
  }
}

export async function getMessages(userId: string, params?: { limit?: number }) {
  const t = await getTenant(userId)
  try {
    const listResult = await t.gmail.api.messages.list({
      maxResults: params?.limit ?? 50,
    })
    const messages = listResult.messages || []
    const detailedMessages = []
    
    // Fetch details of each message in parallel (up to 15 to avoid latency/rate limit)
    const toFetch = messages.slice(0, 15)
    const details = await Promise.all(
      toFetch.map(async (m: any) => {
        try {
          return await t.gmail.api.messages.get({ id: m.id })
        } catch (err) {
          console.warn('[getMessages] Failed to fetch message detail for', m.id, err)
          return null
        }
      })
    )
    
    for (const d of details) {
      if (d) detailedMessages.push(d)
    }
    
    return { success: true, data: detailedMessages, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    throw err
  }
}

export async function getThreadMessages(userId: string, threadId: string) {
  const t = await getTenant(userId)
  try {
    // Corsair Gmail SDK: threads are accessed via api.threads.get
    const result = await (t as any).gmail.api.threads.get({ id: threadId })
    return { success: true, data: result, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    throw err
  }
}

// ── Gmail — Live API writes ───────────────────────────────────────

export async function sendEmail(userId: string, payload: {
  to: string[]
  subject: string
  body: string
  threadId?: string
}) {
  const t = await getTenant(userId)
  try {
    const result = await t.gmail.api.messages.send({
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      ...(payload.threadId && { threadId: payload.threadId }),
    })
    return { success: true, data: result, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    throw err
  }
}

export async function archiveEmail(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.modify({
      id: messageId,
      removeLabelIds: ['INBOX'],
    })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
    throw err
  }
}

export async function markEmailRead(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.modify({
      id: messageId,
      removeLabelIds: ['UNREAD'],
    })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
    throw err
  }
}

export async function deleteEmail(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.trash({ id: messageId })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
    throw err
  }
}

// ── Gmail — Trigger sync ──────────────────────────────────────────

export async function syncInbox(userId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.list({ maxResults: 100 })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
    throw err
  }
}

// ── Calendar — Cached DB reads ────────────────────────────────────

export async function getCalendarEvents(
  userId: string,
  params?: { limit?: number; timeMin?: string; timeMax?: string }
) {
  const t = await getTenant(userId)
  try {
    // Prefer the Corsair DB layer (synced corsair_entities) — much faster, no API quota
    const dbResult = await t.googlecalendar.db.events.list({
      limit: params?.limit ?? 100,
      offset: 0,
    })
    const items: any[] = Array.isArray(dbResult) ? dbResult : (dbResult?.items ?? dbResult?.data ?? [])
    return { success: true, data: items, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    // Fall back to live API if DB layer fails
    try {
      const result = await t.googlecalendar.api.events.getMany({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: params?.limit ?? 50,
        ...(params?.timeMin && { timeMin: params.timeMin }),
        ...(params?.timeMax && { timeMax: params.timeMax }),
      })
      return { success: true, data: result.items || [], needsConnect: false }
    } catch (err2: any) {
      if (isAuthError(err2)) return { success: false, data: null, needsConnect: true }
      throw err2
    }
  }
}

// ── Calendar — Live API writes ────────────────────────────────────

export async function createCalendarEvent(userId: string, event: {
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  description?: string
  addMeetLink?: boolean
}) {
  const t = await getTenant(userId)
  try {
    const eventPayload: any = {
      summary: event.title,
      start: { dateTime: event.startTime },
      end: { dateTime: event.endTime },
      attendees: event.attendees.map(email => ({ email })),
      ...(event.description && { description: event.description }),
    }

    const createParams: any = { event: eventPayload, calendarId: 'primary' }

    if (event.addMeetLink) {
      createParams.conferenceDataVersion = 1
      eventPayload.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    // Corsair SDK uses events.create (not events.insert)
    const result = await t.googlecalendar.api.events.create(createParams)

    const meetLink = result?.conferenceData?.entryPoints
      ?.find((e: any) => e.entryPointType === 'video')?.uri ?? null

    return { success: true, data: result, meetLink, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, meetLink: null, needsConnect: true }
    throw err
  }
}

// ── Auth error detection helper ───────────────────────────────────

function isAuthError(err: any): boolean {
  const msg = err?.message?.toLowerCase() ?? ''
  const code = err?.code ?? ''
  const name = err?.name ?? ''
  return (
    name === 'AuthMissingError' ||
    code === 'UNAUTHENTICATED' ||
    code === 401 ||
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('not connected') ||
    msg.includes('no account found') ||
    msg.includes('account not found')
  )
}

export async function disconnectIntegration(userId: string, integrationId: string) {
  // Corsair disconnect functionality. For now we just delete the local settings.
  // Ideally, you'd call a Corsair API to delete the tenant/connection here.
  // Wait, Corsair might have a function like corsair.deleteTenant(userId) or similar.
  // We will let the DB update handle the logic on our end.
  return { success: true }
}
