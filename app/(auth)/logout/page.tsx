'use client'

import { useEffect, useRef } from 'react'
import { useClerk } from '@clerk/nextjs'

import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function LogoutPage() {
  const { signOut } = useClerk()
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    void signOut({
      redirectUrl: '/',
    }).catch((error) => {
      console.error('[Auth] Clerk sign-out failed', error)
      window.location.href = '/'
    })
  }, [signOut])

  return (
    <div className="flex min-h-screen w-full items-center justify-center relative bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto bg-surface border border-border rounded-[16px] p-[40px] px-[36px] shadow-sm">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display font-semibold text-2xl tracking-tight text-foreground">
            aethra<span className="text-accent">.</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Your inbox, your rules.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center text-center">
          <div className="mb-4 h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="h-6 w-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-foreground">
            Signing you out
          </h2>
          <p className="text-sm text-foreground-muted mt-1">
            We&apos;ll send you back to the homepage in a moment.
          </p>
        </div>
        <p className="text-xs text-foreground-subtle text-center mt-6">
          Privacy-first by design. Your emails never leave your control.
        </p>
      </div>
    </div>
  )
}
