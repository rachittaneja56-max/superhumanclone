import { corsair } from '../corsair'
import { generateOAuthUrl } from 'corsair/oauth'

async function check() {
  try {
    const res = await generateOAuthUrl(corsair, 'gmail', {
      tenantId: 'test-user',
      redirectUri: process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback',
    })
    console.log('URL:', res.url)
  } catch (err: any) {
    console.error('Error generating URL:', err.message, err.stack)
  }
}

check()
