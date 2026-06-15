import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { setupCorsair } from 'corsair'

async function run() {
  console.log('Running Corsair DB migrations and setup...')
  const { corsair } = await import('./corsair')
  
  const result = await setupCorsair(corsair, {
    caller: 'script',
    credentials: {
      gmail: {
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        topic_id: 'dummy-topic'
      },
      googlecalendar: {
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!
      }
    }
  })
  
  console.log(result)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
