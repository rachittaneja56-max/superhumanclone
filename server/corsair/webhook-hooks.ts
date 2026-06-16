import { handleCalendarWebhook, handleGmailWebhook } from '@/server/corsair/webhook-sync'

export const gmailWebhookHooks = {
  messageChanged: {
    after: async (ctx: Record<string, unknown>, result: unknown) => {
      if (!result || typeof result !== 'object') return
      const response = result as { data?: unknown }
      if (!response.data) return
      await handleGmailWebhook(ctx, response.data as Parameters<typeof handleGmailWebhook>[1])
    },
  },
}

export const googleCalendarWebhookHooks = {
  onEventChanged: {
    after: async (ctx: Record<string, unknown>, result: unknown) => {
      if (!result || typeof result !== 'object') return
      const response = result as { data?: unknown }
      if (!response.data) return
      await handleCalendarWebhook(ctx, response.data as Parameters<typeof handleCalendarWebhook>[1])
    },
  },
}
