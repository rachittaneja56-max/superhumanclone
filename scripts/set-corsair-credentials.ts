import { corsair } from '../corsair'
import { setupCorsair } from 'corsair'

async function main() {
  try {
    console.log('Setting up Corsair integrations...')
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set in env')
    }

    const topicId = process.env.GMAIL_PUBSUB_TOPIC
    if (!topicId) {
      console.warn('GMAIL_PUBSUB_TOPIC is not set — Gmail push webhooks will not work until configured')
    }

    await setupCorsair(corsair, {
      credentials: {
        gmail: {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          ...(topicId && { topic_id: topicId }),
        },
        googlecalendar: {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
        },
      },
    })

    console.log('Successfully set root credentials for gmail and googlecalendar')
  } catch (err) {
    console.error('Error setting credentials:', err)
  } finally {
    process.exit(0)
  }
}

main()
