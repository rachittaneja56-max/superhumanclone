import { processOAuthCallback } from 'corsair/oauth'
import { corsair } from '@/corsair'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  
  if (!code || !state) {
    return redirect('/onboarding/connect?error=missing_params')
  }

  const redirectUri = process.env.NEXT_PUBLIC_APP_URL + '/api/corsair/callback'

  try {
    await processOAuthCallback(corsair, {
      code,
      state,
      redirectUri
    })
    
    // Successfully connected! Redirect back to onboarding
    return redirect('/onboarding/connect?connected=true')
  } catch (error: any) {
    console.error('OAuth Callback Error:', error)
    return redirect('/onboarding/connect?error=' + encodeURIComponent(error.message))
  }
}
