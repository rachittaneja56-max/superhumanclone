import { corsair } from '../corsair'

const userId = '566de13b-3646-4955-93bc-835004a5a3c7'
const t = corsair.withTenant(userId) as any

function getHeader(msg: any, name: string): string | undefined {
  return msg.payload?.headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value
}

function extractBody(part: any): string | undefined {
  if (!part) return undefined
  let text: string | undefined
  let html: string | undefined
  if (part.body?.data) {
    try {
      const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8')
      if (part.mimeType === 'text/plain') text = decoded
      else if (part.mimeType === 'text/html') html = decoded
    } catch {}
  }
  if (part.parts) {
    for (const p of part.parts) {
      const body = extractBody(p)
      if (body) {
        if (p.mimeType === 'text/plain') text = body
        else if (p.mimeType === 'text/html' && !text) html = body
      }
    }
  }
  return text || html
}

try {
  console.log('Listing latest 5 messages from Gmail API...')
  const listResult = await t.gmail.api.messages.list({ maxResults: 5 })
  const messages = listResult.messages || []
  console.log(`Found ${messages.length} messages. Fetching details...`)

  for (const m of messages) {
    const detail = await t.gmail.api.messages.get({ id: m.id })
    const subject = getHeader(detail, 'Subject') || '(no subject)'
    const from = getHeader(detail, 'From') || ''
    const to = getHeader(detail, 'To') || ''
    const snippet = detail.snippet || ''
    const body = extractBody(detail.payload) || ''
    
    console.log({
      id: detail.id,
      threadId: detail.threadId,
      from,
      to,
      subject,
      snippet: snippet.slice(0, 50),
      bodyLength: body.length
    })
  }
} catch (err) {
  console.error('Error during testing:', err)
}
