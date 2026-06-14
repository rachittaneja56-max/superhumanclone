import { createClient } from '@corsair-dev/app'

async function setupPlugins() {
  const corsair = createClient({
    apiKey: process.env.CORSAIR_DEV_KEY!,
  })

  const instanceId = process.env.CORSAIR_INSTANCE_ID
  if (!instanceId) {
    throw new Error('CORSAIR_INSTANCE_ID not set')
  }

  const inst = corsair.instance(instanceId)

  console.log(`Configuring plugins for instance: ${instanceId}`)

  // Install Gmail plugin with managed OAuth
  await inst.plugins.upsert('gmail', { 
    authType: 'oauth_2',
    useManaged: true 
  })
  console.log('Gmail plugin configured with useManaged: true')

  // Install Google Calendar plugin with managed OAuth
  await inst.plugins.upsert('googlecalendar', { 
    authType: 'oauth_2',
    useManaged: true 
  })
  console.log('Google Calendar plugin configured with useManaged: true')

  console.log('Plugins successfully provisioned.')
}

setupPlugins().catch(console.error)
