import 'server-only';
import { createClient, type PluginId } from '@corsair-dev/app';

// Single Corsair client for the whole app
// CORSAIR_DEV_KEY from app.corsair.dev/api-keys
const corsairApp = createClient({
  apiKey: process.env.CORSAIR_DEV_KEY!,
});

// The single Corsair instance for Tempo
// CORSAIR_INSTANCE_ID is set after running setupInstance() once
export const corsairInstance = corsairApp.instance(
  process.env.CORSAIR_INSTANCE_ID!
);

// Get a tenant-scoped client for a specific Tempo user
// userId from Auth.js session — this IS the tenant ID
export function getCorsairTenant(userId: string) {
  return corsairInstance.tenant(userId);
}

// Ensure a Corsair tenant exists for this user
// Call this on first sign-in — idempotent
export async function ensureCorsairTenant(userId: string) {
  try {
    return await corsairInstance.tenant(userId).get();
  } catch {
    return await corsairInstance.tenants.create(userId);
  }
}

// Generate a connect link for the user to connect Gmail + Calendar
// Returns a URL — redirect the user to it
export async function createConnectLink(
  userId: string,
  options?: { ttlMs?: number }
) {
  const tenant = getCorsairTenant(userId);
  return tenant.connectLink.create({
    plugins: ['gmail', 'googlecalendar'] as PluginId[],
    ttlMs: options?.ttlMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days default
  });
}

// ── Gmail Operations ──────────────────────────────────────────────

export async function getEmails(
  userId: string,
  params?: {
    limit?: number;
    offset?: number;
  }
) {
  const t = getCorsairTenant(userId);
  const result = await t.run('gmail.db.messages.search', {
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
  });
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null };
  }
  return { needsConnect: false, data: result.data };
}

export async function getThread(userId: string, threadId: string) {
  const t = getCorsairTenant(userId);
  const result = await t.run('gmail.db.threads.search', {
    data: { id: { equals: threadId } },
    limit: 1,
  });
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null };
  }
  return { needsConnect: false, data: result.data };
}

/**
 * Builds a base64url-encoded RFC 2822 email string as required by Gmail API.
 * Path: gmail.api.messages.send requires `raw`, NOT plain text.
 */
function buildRfc2822Email(payload: {
  to: string[];
  subject: string;
  body: string;
  from?: string;
  threadId?: string;
}): string {
  const to = payload.to.join(', ');
  const subject = payload.subject;
  const body = payload.body;

  const mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');

  // base64url: standard base64, replace + with -, / with _, remove trailing =
  const base64 = Buffer.from(mime).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendEmail(
  userId: string,
  payload: {
    to: string[];
    subject: string;
    body: string;
    threadId?: string;
  }
) {
  const t = getCorsairTenant(userId);
  const raw = buildRfc2822Email(payload);

  const result = await t.run('gmail.api.messages.send', {
    raw,
    ...(payload.threadId && { threadId: payload.threadId }),
  });

  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null };
  }
  return { needsConnect: false, data: result.data };
}

export async function archiveEmail(userId: string, messageId: string) {
  const t = getCorsairTenant(userId);
  const result = await t.run('gmail.api.messages.modify', {
    id: messageId,
    removeLabelIds: ['INBOX'],
  });
  if (!result.success) {
    throw new Error('Failed to archive email: ' + result.signInLink);
  }
  return result.data;
}

export async function markEmailRead(userId: string, messageId: string) {
  const t = getCorsairTenant(userId);
  const result = await t.run('gmail.api.messages.modify', {
    id: messageId,
    removeLabelIds: ['UNREAD'],
  });
  if (!result.success) {
    throw new Error('Failed to mark email as read: ' + result.signInLink);
  }
  return result.data;
}

// Refresh Gmail cache by pulling latest from Gmail API
export async function syncGmailInbox(userId: string) {
  const t = getCorsairTenant(userId);
  const result = await t.run('gmail.api.messages.list', {
    maxResults: 100,
  });
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink };
  }
  return { needsConnect: false, synced: true };
}

// ── Calendar Operations ───────────────────────────────────────────

export async function getCalendarEvents(
  userId: string,
  params?: {
    timeMin?: string;
    timeMax?: string;
  }
) {
  const t = getCorsairTenant(userId);
  const result = await t.run('googlecalendar.db.events.search', {
    limit: 50,
  });
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null };
  }
  return { needsConnect: false, data: result.data };
}

export async function createCalendarEvent(
  userId: string,
  event: {
    title: string;
    startTime: string;
    endTime: string;
    attendees: string[];
    description?: string;
  }
) {
  const t = getCorsairTenant(userId);
  const result = await t.run('googlecalendar.api.events.create', {
    event: {
      summary: event.title,
      start: { dateTime: event.startTime },
      end: { dateTime: event.endTime },
      attendees: event.attendees.map((email) => ({ email })),
      ...(event.description && { description: event.description }),
    },
  });
  if (!result.success) {
    return { needsConnect: true, signInLink: result.signInLink, data: null };
  }
  return { needsConnect: false, data: result.data };
}
