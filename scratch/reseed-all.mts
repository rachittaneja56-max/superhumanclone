/**
 * reseed-all.mts
 * Clears bad email rows and re-seeds from Gmail API + Calendar from corsair_entities
 */
import { neon } from '@neondatabase/serverless'
import { corsair } from '../corsair'

const sql = neon(process.env.DATABASE_URL!)
const userId = '566de13b-3646-4955-93bc-835004a5a3c7'

function getHeader(msg: any, name: string): string {
  return msg.payload?.headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function parseFromVal(fromVal: string): { name: string | null; address: string } {
  const match = fromVal.match(/^(.*?)\s*<([^>]+)>/)
  if (match) {
    return { name: match[1].replace(/['"]/g, '').trim() || null, address: match[2].trim() }
  }
  return { name: null, address: fromVal.trim() }
}

function parseEmailBody(payload: any): { text: string; html: string } {
  let text = ''
  let html = ''
  function decode(data: string) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  }
  function traverse(part: any) {
    if (!part) return
    if (part.body?.data) {
      const decoded = decode(part.body.data)
      if (part.mimeType === 'text/plain') text = decoded
      else if (part.mimeType === 'text/html') html = decoded
    }
    if (part.parts) part.parts.forEach(traverse)
  }
  traverse(payload)
  return { text, html }
}

console.log('=== STEP 1: Clearing bad email rows (no from_address/subject) ===')
const deleted = await sql`
  DELETE FROM emails
  WHERE user_id = ${userId}
  AND (from_address = '' OR from_address IS NULL OR subject IS NULL)
  RETURNING id
`
console.log(`Deleted ${deleted.length} bad email rows`)

// Also clean up ALL emails for this user so we get a fresh proper seed
const deletedAll = await sql`DELETE FROM emails WHERE user_id = ${userId} RETURNING id`
console.log(`Cleared ${deletedAll.length} total old email rows for clean reseed`)

console.log('\n=== STEP 2: Fetching emails from Gmail API ===')
const t = corsair.withTenant(userId) as any

try {
  const listResult = await t.gmail.api.messages.list({ maxResults: 50 })
  const messages = listResult.messages || []
  console.log(`Found ${messages.length} messages in Gmail inbox`)

  let inserted = 0
  let skipped = 0

  // Fetch details in batches of 10 to avoid rate limits
  const batchSize = 10
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const details = await Promise.all(
      batch.map(async (m: any) => {
        try {
          return await t.gmail.api.messages.get({ id: m.id })
        } catch (e) {
          console.warn(`  ⚠ Failed to fetch message ${m.id}:`, (e as any)?.message)
          return null
        }
      })
    )

    for (const msg of details) {
      if (!msg) { skipped++; continue }

      const fromVal = getHeader(msg, 'From')
      const toVal = getHeader(msg, 'To')
      const subjectVal = getHeader(msg, 'Subject') || '(no subject)'
      const { name: fromName, address: fromAddress } = parseFromVal(fromVal)
      const { text: bodyText, html: bodyHtml } = parseEmailBody(msg.payload)
      const createdAt = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date()
      const isRead = !msg.labelIds?.includes('UNREAD')

      try {
        await sql`
          INSERT INTO emails (
            user_id, corsair_message_id, thread_id,
            from_address, from_name, to_address,
            subject, snippet,
            body_text, body_html,
            is_read, is_archived, is_deleted,
            ai_triage_skipped, priority, tag,
            created_at
          ) VALUES (
            ${userId},
            ${msg.id},
            ${msg.threadId || msg.id},
            ${fromAddress || 'unknown@unknown.com'},
            ${fromName},
            ${toVal || ''},
            ${subjectVal},
            ${msg.snippet || null},
            ${bodyText || null},
            ${bodyHtml || null},
            ${isRead},
            false,
            false,
            true,
            'medium',
            'other',
            ${createdAt.toISOString()}
          )
          ON CONFLICT (corsair_message_id) DO NOTHING
        `
        inserted++
        console.log(`  ✓ [${inserted}] ${fromName || fromAddress}: ${subjectVal.slice(0, 50)}`)
      } catch (e) {
        console.warn(`  ✗ Failed to insert ${msg.id}:`, (e as any)?.message)
        skipped++
      }
    }
  }

  console.log(`\nEmails seeded: ${inserted} inserted, ${skipped} skipped`)
} catch (e) {
  console.error('Gmail API error:', e)
}

console.log('\n=== STEP 3: Seeding calendar_events from corsair_entities ===')

// Get calendar account ID
const calAccounts = await sql`
  SELECT a.id FROM corsair_accounts a
  INNER JOIN corsair_integrations i ON a.integration_id = i.id
  WHERE a.tenant_id = ${userId} AND i.name = 'googlecalendar'
`
if (calAccounts.length === 0) {
  console.log('No Google Calendar account found, skipping calendar seed')
} else {
  const calAccountId = calAccounts[0].id
  const calEntities = await sql`
    SELECT * FROM corsair_entities
    WHERE account_id = ${calAccountId} AND entity_type = 'events'
  `
  console.log(`Found ${calEntities.length} calendar entities to sync`)

  // Clear old calendar events
  await sql`DELETE FROM calendar_events WHERE user_id = ${userId}`
  console.log('Cleared old calendar_events rows')

  let calInserted = 0
  let calSkipped = 0

  for (const entity of calEntities) {
    const ev = entity.data as any
    if (!ev || !ev.id) { calSkipped++; continue }

    const startRaw = ev.start?.dateTime || ev.start?.date
    const endRaw = ev.end?.dateTime || ev.end?.date
    if (!startRaw || !endRaw) { calSkipped++; continue }

    const startTime = new Date(startRaw)
    const endTime = new Date(endRaw)
    const isAllDay = !!ev.start?.date && !ev.start?.dateTime

    try {
      await sql`
        INSERT INTO calendar_events (
          user_id, corsair_event_id, title, description,
          start_time, end_time, location, is_all_day, status,
          created_at, updated_at
        ) VALUES (
          ${userId},
          ${ev.id},
          ${ev.summary || '(No Title)'},
          ${ev.description || null},
          ${startTime.toISOString()},
          ${endTime.toISOString()},
          ${ev.location || null},
          ${isAllDay},
          ${ev.status || 'confirmed'},
          NOW(), NOW()
        )
        ON CONFLICT (corsair_event_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          location = EXCLUDED.location,
          is_all_day = EXCLUDED.is_all_day,
          status = EXCLUDED.status,
          updated_at = NOW()
      `
      calInserted++
      console.log(`  ✓ Event: ${ev.summary || '(no title)'} @ ${startRaw}`)
    } catch (e) {
      console.warn(`  ✗ Failed to insert event ${ev.id}:`, (e as any)?.message)
      calSkipped++
    }
  }
  console.log(`\nCalendar seeded: ${calInserted} inserted, ${calSkipped} skipped`)
}

console.log('\n=== DONE ===')
const finalEmailCount = await sql`SELECT COUNT(*) as cnt FROM emails WHERE user_id = ${userId}`
const finalCalCount = await sql`SELECT COUNT(*) as cnt FROM calendar_events WHERE user_id = ${userId}`
console.log(`Final: ${finalEmailCount[0].cnt} emails, ${finalCalCount[0].cnt} calendar events`)
