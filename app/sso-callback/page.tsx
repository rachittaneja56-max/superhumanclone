'use client'

import { AuthenticateWithRedirectCallback, useClerk } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'

function SSOCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setActive } = useClerk()
  const [isHandlingMagicLink, setIsHandlingMagicLink] = useState(false)

  useEffect(() => {
    const createdSessionId = searchParams.get('__clerk_created_session')
    if (createdSessionId) {
      setIsHandlingMagicLink(true)
      if (setActive) {
        setActive({ session: createdSessionId }).then(() => {
          router.push('/inbox')
        }).catch((err: unknown) => {
          console.error('Failed to set active session:', err)
          router.push('/login?error=magic_link_failed')
        })
      }
    }
  }, [searchParams, setActive, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-foreground-muted font-medium animate-pulse">
          Completing sign in...
        </p>
        {/* Only render Clerk's OAuth callback if we are not handling a magic link */}
        {!isHandlingMagicLink && <AuthenticateWithRedirectCallback />}
      </div>
    </div>
  )
}

export default function SSOCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-foreground-muted font-medium animate-pulse">
            Loading...
          </p>
        </div>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  )
}
