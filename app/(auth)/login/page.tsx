import { redirect } from 'next/navigation'
import { SignIn } from '@clerk/nextjs'

import { getSession } from '@/lib/auth'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_deprecated: 'Google sign-in has moved to Clerk. Please try again from this page.',
  oauth_callback_disabled: 'The legacy Google callback is disabled. Start sign-in again from this page.',
  clerk_sso_failed: 'Google sign-in could not be started. Please try again.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const session = await getSession()
  const { error, callbackUrl } = await searchParams

  if (session.userId) {
    redirect(callbackUrl || '/inbox')
  }

  const errorMessage = error ? (AUTH_ERROR_MESSAGES[error] ?? 'Sign-in failed. Please try again.') : ''
  const isClerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  )
  const targetUrl = callbackUrl || '/inbox'

  return (
    <div className="flex min-h-screen w-full items-center justify-center relative bg-background overflow-hidden">
      {/* Background Dot Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />

      {/* Theme Toggle in top right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto bg-surface border border-border rounded-[16px] p-[40px] px-[36px] shadow-sm">
        {/* Section 1 - Brand */}
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display font-semibold text-2xl tracking-tight text-foreground">
            aethra<span className="text-accent">.</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Your inbox, your rules.
          </p>
        </div>

        {/* Section 2 - Error */}
        {errorMessage && (
          <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {/* Separator */}
        <div className="h-[1px] w-full bg-border my-6" />

        {/* Section 3 - Clerk Sign In */}
        {isClerkConfigured ? (
          <div className="overflow-hidden rounded-[14px] border border-border/80 bg-background/70">
            <SignIn
              path="/login"
              routing="path"
              oauthFlow="redirect"
              fallbackRedirectUrl={targetUrl}
              forceRedirectUrl={targetUrl}
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  cardBox: 'w-full',
                  card: 'w-full rounded-none border-0 bg-transparent p-0 shadow-none',
                  header: 'hidden',
                  footer: 'hidden',
                  socialButtonsBlockButton:
                    'h-11 rounded-lg border border-border bg-accent text-accent-foreground shadow-none hover:bg-accent/90',
                  socialButtonsBlockButtonText: 'text-sm font-medium text-accent-foreground',
                  socialButtonsProviderIcon__google: 'h-[18px] w-[18px]',
                  dividerLine: 'bg-border',
                  dividerText: 'bg-background px-2 text-xs uppercase tracking-[0.16em] text-foreground-muted',
                  formFieldInput:
                    'h-11 rounded-lg border border-border bg-background text-sm text-foreground shadow-none focus:border-accent focus:ring-1 focus:ring-accent/50',
                  formButtonPrimary:
                    'h-11 rounded-lg bg-accent text-sm font-medium text-accent-foreground shadow-none hover:bg-accent/90',
                  formFieldLabel: 'text-sm text-foreground-muted',
                  formFieldHintText: 'text-xs text-foreground-subtle',
                  footerActionLink: 'text-accent hover:text-accent/80',
                  identityPreviewText: 'text-sm text-foreground',
                  formResendCodeLink: 'text-accent hover:text-accent/80',
                  otpCodeFieldInput:
                    'h-11 rounded-lg border border-border bg-background text-sm text-foreground shadow-none focus:border-accent focus:ring-1 focus:ring-accent/50',
                  alertText: 'text-sm',
                },
              }}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
            Clerk is not configured yet. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login` before using Google sign-in.
          </div>
        )}

        {/* Section 4 - Footer */}
        <p className="text-xs text-foreground-subtle text-center mt-6">
          Privacy-first by design. Your emails never leave your control.
        </p>
      </div>
    </div>
  )
}
