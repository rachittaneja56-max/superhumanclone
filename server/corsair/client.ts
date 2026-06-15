import 'server-only'
import { corsair } from '@/corsair'

// Type helper — plugins are dynamically attached, need 'as any'
type CorsairTenant = {
  gmail: {
    api: {
      messages: {
        list: (params: any) => Promise<any>
        send: (params: any) => Promise<any>
        modify: (params: any) => Promise<any>
        trash: (params: any) => Promise<any>
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
        list: (params: any) => Promise<any>
        insert: (params: any) => Promise<any>
      }
    }
    db: {
      events: { list: (params: any) => Promise<any> }
    }
  }
}

function getTenant(userId: string): CorsairTenant {
  return corsair.withTenant(userId) as any
}

// ── Connection check ─────────────────────────────────────────────

export async function isUserConnected(
  userId: string,
  plugin: 'gmail' | 'googlecalendar'
): Promise<boolean> {
  try {
    const t = getTenant(userId)
    if (plugin === 'gmail') {
      await t.gmail.db.threads.list({ limit: 1 })
    } else {
      await t.googlecalendar.db.events.list({ limit: 1 })
    }
    return true
  } catch (err: any) {
    if (isAuthError(err)) return false
    throw err
  }
}

import { generateOAuthUrl } from 'corsair/oauth'

export async function getGmailAuthUrl(userId: string): Promise<string> {
  const result = await generateOAuthUrl(corsair, 'gmail', {
    tenantId: userId,
    redirectUri: process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback',
  })
  return result.url
}

export async function getCalendarAuthUrl(userId: string): Promise<string> {
  const result = await generateOAuthUrl(corsair, 'googlecalendar', {
    tenantId: userId,
    redirectUri: process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback',
  })
  return result.url
}

// ── Gmail — Cached DB reads (RECOMMENDED for UI) ─────────────────

export async function getThreads(userId: string, params?: { limit?: number; offset?: number }) {
  const t = getTenant(userId)
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

export async function getThreadMessages(userId: string, threadId: string) {
  const t = getTenant(userId)
  try {
    const result = await t.gmail.db.messages.list({ threadId })
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
  const t = getTenant(userId)
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
  const t = getTenant(userId)
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
  const t = getTenant(userId)
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
  const t = getTenant(userId)
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
  const t = getTenant(userId)
  try {
    await t.gmail.api.messages.list({ maxResults: 100 })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
    throw err
  }
}

// ── Calendar — Cached DB reads ────────────────────────────────────

export async function getCalendarEvents(userId: string, params?: { limit?: number }) {
  const t = getTenant(userId)
  try {
    let result
    try {
      result = await t.googlecalendar.db.events.list({
        limit: params?.limit ?? 50,
      })
    } catch (zodErr: any) {
      if (zodErr?.name === 'ZodError') {
        console.warn('[Calendar] ZodError on eventType — using raw data')
        result = zodErr.data ?? []
      } else {
        throw zodErr
      }
    }
    return { success: true, data: result, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    throw err
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
  const t = getTenant(userId)
  try {
    const payload: any = {
      summary: event.title,
      start: { dateTime: event.startTime },
      end: { dateTime: event.endTime },
      attendees: event.attendees.map(email => ({ email })),
      ...(event.description && { description: event.description }),
    }

    if (event.addMeetLink) {
      payload.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
      payload.conferenceDataVersion = 1
    }

    const result = await t.googlecalendar.api.events.insert(payload)

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
  return (
    code === 'UNAUTHENTICATED' ||
    code === 401 ||
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('not connected') ||
    msg.includes('no account found')
  )
}
