import { createClient } from '@corsair-dev/app'
import fs from 'fs'

async function setup() {
  const envText = fs.readFileSync('.env.local', 'utf8')
  const env = Object.fromEntries(
    envText.split('\n')
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const i = line.indexOf('=')
        return [line.slice(0, i), line.slice(i + 1).replace(/"/g, '').trim()]
      })
  )

  const corsair = createClient({ apiKey: env.CORSAIR_DEV_KEY })
  const inst = corsair.instance(env.CORSAIR_INSTANCE_ID)

  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET

  console.log('Upserting plugins with custom OAuth...')
  await inst.plugins.upsert('gmail', { authType: 'oauth_2', useManaged: false })
  await inst.plugins.upsert('googlecalendar', { authType: 'oauth_2', useManaged: false })

  console.log('Setting root credentials for Gmail...')
  await inst.plugins.credentials.setRoot('gmail', 'client_id', clientId)
  await inst.plugins.credentials.setRoot('gmail', 'client_secret', clientSecret)

  console.log('Setting root credentials for Google Calendar...')
  await inst.plugins.credentials.setRoot('googlecalendar', 'client_id', clientId)
  await inst.plugins.credentials.setRoot('googlecalendar', 'client_secret', clientSecret)

  console.log('Custom OAuth credentials set on instance successfully!')
}

setup().catch(console.error)
