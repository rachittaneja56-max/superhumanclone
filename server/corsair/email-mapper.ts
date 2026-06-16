import 'server-only'

type MessagePart = {
  mimeType?: string
  body?: { data?: string }
  parts?: MessagePart[]
  headers?: { name?: string; value?: string }[]
}

type GmailMessage = {
  id?: string
  threadId?: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: MessagePart
}

export function getHeader(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers as { name?: string; value?: string }[] | undefined
  if (!headers) return ''
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

export function parseFromVal(fromVal: string): { name: string | null; address: string } {
  const match = fromVal.match(/^(.*?)\s*<([^>]+)>/)
  if (match) {
    return { name: match[1].replace(/['"]/g, '').trim() || null, address: match[2].trim() }
  }
  return { name: null, address: fromVal.trim() }
}

export function parseEmailBody(payload: MessagePart | undefined): { text: string; html: string } {
  let text = ''
  let html = ''

  function decode(data: string) {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  }

  function traverse(part: MessagePart | undefined) {
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

export function mapGmailMessageToEmailRow(userId: string, msg: GmailMessage) {
  const fromVal = getHeader(msg, 'From')
  const toVal = getHeader(msg, 'To')
  const subjectVal = getHeader(msg, 'Subject') || '(no subject)'
  const { name: fromName, address: fromAddress } = parseFromVal(fromVal)
  const { text: bodyText, html: bodyHtml } = parseEmailBody(msg.payload)

  return {
    userId,
    corsair_message_id: msg.id!,
    thread_id: msg.threadId || msg.id!,
    subject: subjectVal,
    from_address: fromAddress || 'unknown@unknown.com',
    from_name: fromName,
    to_address: toVal || '',
    snippet: msg.snippet || null,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    is_read: !msg.labelIds?.includes('UNREAD'),
    is_archived: msg.labelIds?.includes('INBOX') === false,
    is_deleted: false,
    created_at: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
  }
}
