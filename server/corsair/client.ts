import 'server-only'
import { db } from '@/server/db'
import { corsairAccounts, corsairEntities, corsairEvents, corsairIntegrations, users } from '@/server/db/schema'
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
        delete: (params: any) => Promise<any>
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

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function sanitiseHeaderValue(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function sanitiseAddressList(addresses: string[] | undefined): string[] {
  return (addresses ?? [])
    .map((address) => sanitiseHeaderValue(address))
    .filter(Boolean)
}

function buildMimeMessage(payload: {
  from?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
}): string {
  const to = sanitiseAddressList(payload.to)
  const cc = sanitiseAddressList(payload.cc)
  const bcc = sanitiseAddressList(payload.bcc)
  const from = sanitiseHeaderValue(payload.from)
  const subject = sanitiseHeaderValue(payload.subject)
  const body = (payload.body ?? '').replace(/\r?\n/g, '\r\n')

  const headers = [
    from ? `From: ${from}` : null,
    `To: ${to.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : null,
    bcc.length ? `Bcc: ${bcc.join(', ')}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ].filter((line): line is string => Boolean(line))

  // Preserve the required blank line between headers and body so Gmail/Corsair
  // treats the message body as message content rather than a malformed header.
  const mime = `${headers.join('\r\n')}\r\n\r\n${body}`
  return encodeBase64Url(mime)
}

// ── Connection check ─────────────────────────────────────────────

export async function isUserConnected(
  userId: string,
  plugin: 'gmail' | 'googlecalendar'
): Promise<boolean> {
  try {
    const account = await db
      .select({ id: corsairAccounts.id })
      .from(corsairAccounts)
      .innerJoin(corsairIntegrations, eq(corsairAccounts.integrationId, corsairIntegrations.id))
      .where(and(eq(corsairAccounts.tenantId, userId), eq(corsairIntegrations.name, plugin)))
      .limit(1)
    return !!account
  } catch (err: any) {
    console.error(`[isUserConnected] Error checking connection for ${plugin}:`, err)
    return false
  }
}

import { generateOAuthUrl } from 'corsair/oauth'

export async function getGmailAuthUrl(userId: string, redirectUri?: string): Promise<string> {
  const { ensureIntegrationCredentials } = await import('@/server/corsair/provision')
  await ensureIntegrationCredentials()
  const { corsair } = await import('@/corsair')
  const { getConfiguredAppUrl } = await import('@/server/corsair/url')
  const rUri = redirectUri || `${getConfiguredAppUrl()}/api/corsair/callback`
  const result = await generateOAuthUrl(corsair, 'gmail', {
    tenantId: userId,
    redirectUri: rUri,
  })
  return result.url
}

export async function getCalendarAuthUrl(userId: string, redirectUri?: string): Promise<string> {
  const { ensureIntegrationCredentials } = await import('@/server/corsair/provision')
  await ensureIntegrationCredentials()
  const { corsair } = await import('@/corsair')
  const { getConfiguredAppUrl } = await import('@/server/corsair/url')
  const rUri = redirectUri || `${getConfiguredAppUrl()}/api/corsair/callback`
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

export async function getMessages(userId: string, params?: { limit?: number; pageToken?: string }) {
  return listAndHydrateMessages(userId, {
    limit: params?.limit ?? 50,
    pageToken: params?.pageToken,
  })
}

export async function getDraftMessages(userId: string, params?: { limit?: number; pageToken?: string }) {
  return listAndHydrateMessages(userId, {
    limit: params?.limit ?? 50,
    pageToken: params?.pageToken,
    q: 'in:drafts',
  })
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

async function listAndHydrateMessages(
  userId: string,
  params: { limit: number; pageToken?: string; q?: string }
) {
  const t = await getTenant(userId)
  try {
    const listResult = await t.gmail.api.messages.list({
      maxResults: params.limit,
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
      ...(params.q ? { q: params.q } : {}),
    })
    const messages = listResult.messages || []
    const toFetch = messages
    const details = await Promise.all(
      toFetch.map(async (m: any) => {
        try {
          return await t.gmail.api.messages.get({ id: m.id })
        } catch (err) {
          console.warn('[listAndHydrateMessages] Failed to fetch message detail for', m.id, err)
          return null
        }
      })
    )

    return {
      success: true,
      data: details.filter(Boolean),
      needsConnect: false,
      nextPageToken: listResult.nextPageToken ?? null,
      resultSizeEstimate: listResult.resultSizeEstimate ?? null,
    }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true, nextPageToken: null, resultSizeEstimate: null }
    throw err
  }
}

// ── Gmail — Live API writes ───────────────────────────────────────

export async function sendEmail(userId: string, payload: {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  threadId?: string
}) {
  const t = await getTenant(userId)
  try {
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, name: true },
    })
    const fromHeader = currentUser?.name
      ? `${sanitiseHeaderValue(currentUser.name)} <${sanitiseHeaderValue(currentUser.email)}>`
      : sanitiseHeaderValue(currentUser?.email)
    const body = typeof payload.body === 'string' ? payload.body : ''

    const result = await t.gmail.api.messages.send({
      raw: buildMimeMessage({
        from: fromHeader,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        body,
      }),
      ...(payload.threadId ? { threadId: payload.threadId } : {}),
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

export async function permanentlyDeleteEmail(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await (t.gmail.api.messages as any).delete({ id: messageId })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
    throw err
  }
}

export async function restoreArchivedEmail(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.modify({
      id: messageId,
      addLabelIds: ['INBOX'],
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

export async function markEmailUnread(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.modify({
      id: messageId,
      addLabelIds: ['UNREAD'],
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

export async function restoreEmailFromTrash(userId: string, messageId: string) {
  const t = await getTenant(userId)
  try {
    await t.gmail.api.messages.modify({
      id: messageId,
      removeLabelIds: ['TRASH'],
      addLabelIds: ['INBOX'],
    })
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
  const hasRange = Boolean(params?.timeMin || params?.timeMax)
  try {
    if (hasRange) {
      const result = await t.googlecalendar.api.events.getMany({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: params?.limit ?? 250,
        ...(params?.timeMin && { timeMin: params.timeMin }),
        ...(params?.timeMax && { timeMax: params.timeMax }),
      })
      return { success: true, data: result.items || [], needsConnect: false }
    }

    // Prefer the Corsair DB layer (synced corsair_entities) — much faster, no API quota
    const dbResult = await t.googlecalendar.db.events.list({
      limit: params?.limit ?? 100,
      offset: 0,
    })
    const items: any[] = Array.isArray(dbResult) ? dbResult : (dbResult?.items ?? dbResult?.data ?? [])
    return { success: true, data: items, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, needsConnect: true }
    // Fall back to the other source if the primary one fails
    try {
      if (hasRange) {
        const dbResult = await t.googlecalendar.db.events.list({
          limit: params?.limit ?? 100,
          offset: 0,
        })
        const items: any[] = Array.isArray(dbResult) ? dbResult : (dbResult?.items ?? dbResult?.data ?? [])
        return { success: true, data: items, needsConnect: false }
      }

      const result = await t.googlecalendar.api.events.getMany({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: params?.limit ?? 50,
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
  location?: string
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
      ...(event.location && { location: event.location }),
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

export async function updateCalendarEvent(userId: string, event: {
  eventId: string
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  description?: string
  location?: string
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
      ...(event.location && { location: event.location }),
    }

    if (event.addMeetLink) {
      eventPayload.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    const result = await t.googlecalendar.api.events.update({
      calendarId: 'primary',
      eventId: event.eventId,
      event: eventPayload,
      ...(event.addMeetLink ? { conferenceDataVersion: 1 } : {}),
    })

    const meetLink = result?.conferenceData?.entryPoints
      ?.find((e: any) => e.entryPointType === 'video')?.uri ?? null

    return { success: true, data: result, meetLink, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, data: null, meetLink: null, needsConnect: true }
    throw err
  }
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  const t = await getTenant(userId)
  try {
    await t.googlecalendar.api.events.delete({
      calendarId: 'primary',
      eventId,
    })
    return { success: true, needsConnect: false }
  } catch (err: any) {
    if (isAuthError(err)) return { success: false, needsConnect: true }
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
  try {
    const integration = await db.query.corsairIntegrations.findFirst({
      where: eq(corsairIntegrations.name, integrationId),
      columns: { id: true, name: true },
    })

    if (!integration) {
      return { success: false, reason: 'integration_not_found' as const }
    }

    const account = await db.query.corsairAccounts.findFirst({
      where: and(eq(corsairAccounts.tenantId, userId), eq(corsairAccounts.integrationId, integration.id)),
      columns: { id: true },
    })

    if (account) {
      await db.delete(corsairEntities).where(eq(corsairEntities.accountId, account.id))
      await db.delete(corsairEvents).where(eq(corsairEvents.accountId, account.id))
      await db.delete(corsairAccounts).where(eq(corsairAccounts.id, account.id))
    }

    return { success: true, revoked: Boolean(account) }
  } catch {
    console.error('[disconnectIntegration] Failed to disconnect integration', {
      integrationId,
      userId: userId.slice(0, 8),
    })
    return { success: false, reason: 'disconnect_failed' as const }
  }
}
