 import 'server-only';

import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { TRPCError } from '@trpc/server';

const CORSAIR_API_BASE = 'https://api.corsair.dev/v1';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

export class CorsairError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
    this.name = 'CorsairError';
  }
}

class CorsairClient {
  private async getToken(userId: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { corsair_token_encrypted: true }
    });

    if (!user || !user.corsair_token_encrypted) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Corsair not connected' });
    }

    try {
      return decrypt(user.corsair_token_encrypted, ENCRYPTION_KEY);
    } catch (e) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to decrypt integration token' });
    }
  }

  private async fetchApi(userId: string, path: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getToken(userId);
    
    const res = await fetch(`${CORSAIR_API_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const errorBody = await res.json();
        message = errorBody.message || message;
      } catch (e) {}

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        throw new CorsairError(429, 'Rate limit exceeded', retryAfter ? parseInt(retryAfter, 10) : undefined);
      }

      throw new CorsairError(res.status, message);
    }

    // Some endpoints like DELETE might not return JSON
    if (res.status === 204) return null;
    return res.json();
  }

  // --- Gmail ---

  async getEmails(userId: string, params: { maxResults?: number, pageToken?: string, q?: string } = {}) {
    const query = new URLSearchParams();
    if (params.maxResults) query.append('maxResults', params.maxResults.toString());
    if (params.pageToken) query.append('pageToken', params.pageToken);
    if (params.q) query.append('q', params.q);

    const qs = query.toString();
    return this.fetchApi(userId, `/integrations/gmail/messages${qs ? `?${qs}` : ''}`);
  }

  async getThread(userId: string, threadId: string) {
    return this.fetchApi(userId, `/integrations/gmail/threads/${threadId}`);
  }

  async sendEmail(userId: string, data: { to: string, subject: string, body: string, threadId?: string }) {
    return this.fetchApi(userId, '/integrations/gmail/messages/send', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async markRead(userId: string, messageId: string) {
    return this.fetchApi(userId, `/integrations/gmail/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
    });
  }

  async archiveMessage(userId: string, messageId: string) {
    return this.fetchApi(userId, `/integrations/gmail/messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['INBOX'] })
    });
  }

  async deleteMessage(userId: string, messageId: string) {
    return this.fetchApi(userId, `/integrations/gmail/messages/${messageId}`, {
      method: 'DELETE'
    });
  }

  // --- Calendar ---

  async getCalendarEvents(userId: string, params: { timeMin: string, timeMax: string }) {
    const query = new URLSearchParams({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
    });
    return this.fetchApi(userId, `/integrations/calendar/events?${query.toString()}`);
  }

  async createCalendarEvent(userId: string, data: { title: string, startTime: string, endTime: string, attendees?: string[], description?: string }) {
    return this.fetchApi(userId, '/integrations/calendar/events', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

export const corsairClient = new CorsairClient();
