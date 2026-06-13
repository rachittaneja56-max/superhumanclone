import { createClient } from '@corsair-dev/app'

async function setupCorsairInstance() {
  const corsair = createClient({
    apiKey: process.env.CORSAIR_DEV_KEY!,
  })

  // Create instance (run once)
  const instance = await corsair.instances.create({
    name: 'tempo-production',
  })
  console.log('CORSAIR_INSTANCE_ID=', instance.id)
  // Save this ID to your .env.local and Railway env vars

  const inst = corsair.instance(instance.id)

  // Install Gmail plugin
  await inst.plugins.upsert('gmail', { authType: 'oauth_2' })

  // Set Gmail OAuth credentials (from Google Cloud Console)
  await inst.plugins.credentials.setRoot('gmail', 'client_id',
    process.env.GOOGLE_CLIENT_ID!)
  await inst.plugins.credentials.setRoot('gmail', 'client_secret',
    process.env.GOOGLE_CLIENT_SECRET!)

  // Install Google Calendar plugin
  await inst.plugins.upsert('googlecalendar', { authType: 'oauth_2' })
  await inst.plugins.credentials.setRoot('googlecalendar', 'client_id',
    process.env.GOOGLE_CLIENT_ID!)
  await inst.plugins.credentials.setRoot('googlecalendar', 'client_secret',
    process.env.GOOGLE_CLIENT_SECRET!)

  console.log('Corsair instance configured successfully')
  console.log('Add to your .env: CORSAIR_INSTANCE_ID=' + instance.id)
}

setupCorsairInstance().catch(console.error)
