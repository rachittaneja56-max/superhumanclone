import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { setupCorsair } from 'corsair'

async function run() {
  console.log('Running Corsair DB migrations and setup...')
  const { corsair } = await import('./corsair')

  const topicId = process.env.GMAIL_PUBSUB_TOPIC
  if (!topicId) {
    console.warn('GMAIL_PUBSUB_TOPIC is not set — Gmail push webhooks will not work until configured')
  }

  const result = await setupCorsair(corsair, {
    caller: 'script',
    credentials: {
      gmail: {
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        ...(topicId && { topic_id: topicId }),
      },
      googlecalendar: {
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
  })

  console.log(result)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
