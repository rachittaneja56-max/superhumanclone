import 'server-only'
import { setupCorsair } from 'corsair'

let integrationSetupPromise: Promise<void> | null = null

export async function ensureIntegrationCredentials() {
  if (integrationSetupPromise) return integrationSetupPromise

  integrationSetupPromise = (async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      console.warn('[Corsair] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — OAuth will fail')
      return
    }

    const { corsair } = await import('@/corsair')
    await setupCorsair(corsair, {
      caller: 'script',
      credentials: {
        gmail: {
          client_id: clientId,
          client_secret: clientSecret,
          ...(process.env.GMAIL_PUBSUB_TOPIC && { topic_id: process.env.GMAIL_PUBSUB_TOPIC }),
        },
        googlecalendar: {
          client_id: clientId,
          client_secret: clientSecret,
        },
      },
    })
  })()

  return integrationSetupPromise
}

export async function ensureTenantProvisioned(userId: string) {
  await ensureIntegrationCredentials()
  const { corsair } = await import('@/corsair')
  await setupCorsair(corsair, { tenantId: userId, caller: 'script' })
}
