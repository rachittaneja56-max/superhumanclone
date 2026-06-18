import 'server-only'

import { db } from '@/server/db'
import { sql } from 'drizzle-orm'

export type CalendarEventsColumnPresence = {
  hasMeetingLink: boolean
  hasAttendeesSummary: boolean
}

export type CalendarEventCompatRow = {
  id: string
  user_id: string
  corsair_event_id: string
  title: string
  description: string | null
  start_time: Date
  end_time: Date
  location: string | null
  meeting_link: string | null
  attendees_summary: string | null
  is_all_day: boolean
  status: string
  created_at: Date
  updated_at: Date
}

type CalendarEventUpsertInput = {
  userId: string
  corsair_event_id: string
  title: string
  description: string | null
  start_time: Date
  end_time: Date
  location: string | null
  meeting_link: string | null
  attendees_summary: string | null
  is_all_day: boolean
  status: string
}

let cachedPresence: Promise<CalendarEventsColumnPresence> | null = null

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

export async function getCalendarEventsColumnPresence(): Promise<CalendarEventsColumnPresence> {
  if (!cachedPresence) {
    cachedPresence = (async () => {
      const rows = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'calendar_events'
      `)

      const names = new Set(rows.rows.map((row: any) => String(row.column_name)))
      return {
        hasMeetingLink: names.has('meeting_link'),
        hasAttendeesSummary: names.has('attendees_summary'),
      }
    })().catch((error) => {
      cachedPresence = null
      throw error
    })
  }

  return cachedPresence
}

export async function listCalendarEventsCompat(
  executor: { execute: typeof db.execute },
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEventCompatRow[]> {
  const presence = await getCalendarEventsColumnPresence()
  const selectColumns = [
    `"id"`,
    `"user_id"`,
    `"corsair_event_id"`,
    `"title"`,
    `"description"`,
    `"start_time"`,
    `"end_time"`,
    `"location"`,
    presence.hasMeetingLink ? `"meeting_link"` : `null::text as "meeting_link"`,
    presence.hasAttendeesSummary ? `"attendees_summary"` : `null::text as "attendees_summary"`,
    `"is_all_day"`,
    `"status"`,
    `"created_at"`,
    `"updated_at"`,
  ].join(', ')

  const result = await executor.execute(sql`
    select ${sql.raw(selectColumns)}
    from "calendar_events"
    where "user_id" = ${userId}
      and "start_time" >= ${startDate}
      and "start_time" <= ${endDate}
    order by "start_time" asc
  `)

  return result.rows as CalendarEventCompatRow[]
}

export async function findCalendarEventCompat(
  executor: { execute: typeof db.execute },
  userId: string,
  eventId: string,
): Promise<CalendarEventCompatRow | null> {
  const presence = await getCalendarEventsColumnPresence()
  const selectColumns = [
    `"id"`,
    `"user_id"`,
    `"corsair_event_id"`,
    `"title"`,
    `"description"`,
    `"start_time"`,
    `"end_time"`,
    `"location"`,
    presence.hasMeetingLink ? `"meeting_link"` : `null::text as "meeting_link"`,
    presence.hasAttendeesSummary ? `"attendees_summary"` : `null::text as "attendees_summary"`,
    `"is_all_day"`,
    `"status"`,
    `"created_at"`,
    `"updated_at"`,
  ].join(', ')

  const result = await executor.execute(sql`
    select ${sql.raw(selectColumns)}
    from "calendar_events"
    where "user_id" = ${userId}
      and ("id" = ${eventId} or "corsair_event_id" = ${eventId})
    order by "start_time" asc
    limit 1
  `)

  return (result.rows[0] as CalendarEventCompatRow | undefined) ?? null
}

export async function upsertCalendarEventCompat(
  executor: { execute: typeof db.execute },
  input: CalendarEventUpsertInput,
): Promise<void> {
  const presence = await getCalendarEventsColumnPresence()
  const record: Record<string, unknown> = {
    user_id: input.userId,
    corsair_event_id: input.corsair_event_id,
    title: input.title,
    description: input.description,
    start_time: input.start_time,
    end_time: input.end_time,
    location: input.location,
    is_all_day: input.is_all_day,
    status: input.status,
  }

  if (presence.hasMeetingLink) {
    record.meeting_link = input.meeting_link
  }
  if (presence.hasAttendeesSummary) {
    record.attendees_summary = input.attendees_summary
  }

  const columns = Object.keys(record)
  const quotedColumns = columns.map(quoteIdent).join(', ')
  const values = Object.values(record)
  const insertValues = sql.join(values.map((value) => sql`${value}`), sql.raw(', '))
  const updateColumns = columns.filter((column) => column !== 'user_id' && column !== 'corsair_event_id')
  const updateClause = [
    ...updateColumns.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`),
    `${quoteIdent('updated_at')} = now()`,
  ].join(', ')

  await executor.execute(sql`
    insert into "calendar_events" (${sql.raw(quotedColumns)})
    values (${insertValues})
    on conflict (${sql.raw(quoteIdent('corsair_event_id'))}) do update set ${sql.raw(updateClause)}
  `)
}
