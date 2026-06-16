export type EmailListClientItem = {
  id: string
  threadId: string
  mailbox?: 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash'
  senderName: string
  subject: string
  snippet: string
  isRead: boolean
  aiTriageSkipped?: boolean
  tldr?: string | null
  receivedAt: string | null
  badges: string[]
}

export type EmailThreadClientItem = {
  id: string
  threadId: string
  senderName: string
  senderAddress?: string | null
  recipientAddress?: string | null
  recipientSummary: string
  subject: string
  snippet: string
  bodyHtml?: string | null
  bodyText?: string | null
  isRead: boolean
  aiTriageSkipped?: boolean
  tldr?: string | null
  createdAt: string | null
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  nbsp: ' ',
  quot: '"',
  lt: '<',
  gt: '>',
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: '...',
}

export function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return ''

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    }
    return NAMED_HTML_ENTITIES[entity] ?? _
  })
}

export function safeDisplayName(name?: string | null, address?: string | null): string {
  const normalizedName = decodeHtmlEntities(name).replace(/["<>]/g, '').trim()
  if (normalizedName) return normalizedName

  const localPart = (address ?? '').split('@')[0]?.trim()
  if (!localPart) return 'Unknown sender'

  return localPart
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function redactSensitiveForClient(value: string | null | undefined): string {
  const decoded = decodeHtmlEntities(value)
  if (!decoded) return ''

  return decoded
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(to|cc|bcc|from):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summariseRecipients(value: string | null | undefined): string {
  const raw = value ?? ''
  if (!raw.trim()) return 'Recipients hidden'

  const recipients = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const nameMatch = part.match(/^(.*?)\s*<([^>]+)>$/)
      if (nameMatch) {
        return safeDisplayName(nameMatch[1], nameMatch[2])
      }
      return safeDisplayName('', part)
    })

  if (recipients.length === 0) return 'Recipients hidden'
  if (recipients.length === 1) return recipients[0]
  return `${recipients[0]} +${recipients.length - 1}`
}

export function sanitiseEmailHtml(value: string | null | undefined): string | null {
  if (!value) return null

  const withoutScripts = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<base[\s\S]*?>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\sjavascript:/gi, ' ')

  return withoutScripts.trim() || null
}

export function mapEmailForListClient(row: {
  id?: string | null
  thread_id?: string | null
  from_name?: string | null
  from_address?: string | null
  subject?: string | null
  snippet?: string | null
  is_read?: boolean | null
  tldr?: string | null
  ai_triage_skipped?: boolean | null
  created_at?: string | Date | null
  mailbox?: 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash'
}): EmailListClientItem {
  const subject = redactSensitiveForClient(row.subject) || '(no subject)'
  const snippet = redactSensitiveForClient(row.snippet) || 'No preview available.'
  const threadId = row.thread_id || row.id || crypto.randomUUID()

  return {
    id: threadId,
    threadId,
    mailbox: row.mailbox,
    senderName: safeDisplayName(row.from_name, row.from_address),
    subject,
    snippet,
    isRead: Boolean(row.is_read),
    aiTriageSkipped: Boolean(row.ai_triage_skipped),
    tldr: row.tldr ? redactSensitiveForClient(row.tldr) : null,
    receivedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    badges: buildBadges(row),
  }
}

export function mapEmailForThreadClient(row: {
  id: string
  thread_id?: string | null
  from_name?: string | null
  from_address?: string | null
  to_address?: string | null
  subject?: string | null
  snippet?: string | null
  body_html?: string | null
  body_text?: string | null
  is_read?: boolean | null
  ai_triage_skipped?: boolean | null
  tldr?: string | null
  created_at?: string | Date | null
}): EmailThreadClientItem {
  return {
    id: row.id,
    threadId: row.thread_id || row.id,
    senderName: safeDisplayName(row.from_name, row.from_address),
    senderAddress: row.from_address ?? null,
    recipientAddress: row.to_address ?? null,
    recipientSummary: summariseRecipients(row.to_address),
    subject: redactSensitiveForClient(row.subject) || '(no subject)',
    snippet: redactSensitiveForClient(row.snippet) || 'No preview available.',
    bodyHtml: sanitiseEmailHtml(row.body_html),
    bodyText: row.body_text ? decodeHtmlEntities(row.body_text).trim() : null,
    isRead: Boolean(row.is_read),
    aiTriageSkipped: Boolean(row.ai_triage_skipped),
    tldr: row.tldr ? redactSensitiveForClient(row.tldr) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }
}

function buildBadges(row: {
  mailbox?: 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash'
  is_read?: boolean | null
  ai_triage_skipped?: boolean | null
}) {
  const badges: string[] = []
  if (!row.is_read) badges.push('Unread')
  if (row.mailbox && row.mailbox !== 'inbox') {
    badges.push(row.mailbox.charAt(0).toUpperCase() + row.mailbox.slice(1))
  }
  if (row.ai_triage_skipped) badges.push('Private')
  return badges
}
