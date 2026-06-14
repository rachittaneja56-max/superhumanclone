import { NextResponse } from 'next/server'
import { createClient } from '@corsair-dev/app'

export async function GET() {
  try {
    const corsair = createClient({ apiKey: process.env.CORSAIR_DEV_KEY! })
    const inst = corsair.instance(process.env.CORSAIR_INSTANCE_ID!)

    const clientId = process.env.GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!

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

    return NextResponse.json({ success: true, message: 'Custom credentials deployed to Corsair' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
