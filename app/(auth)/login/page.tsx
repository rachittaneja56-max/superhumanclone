import { ThemeToggle } from '@/components/ui/theme-toggle'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const { error, callbackUrl } = await searchParams

  const errorMessage = error ? 'Sign-in failed. Please try again.' : ''
  const targetUrl = callbackUrl ? `/api/auth/google?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/api/auth/google'

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

        {/* Section 3 - Google Sign In */}
        <a
          href={targetUrl}
          className={`
            relative flex h-11 w-full items-center justify-center gap-3 rounded-lg
            bg-accent text-accent-foreground font-medium text-sm
            transition-all duration-200 overflow-hidden
            hover:opacity-90 hover:scale-[1.02]
          `}
        >
          {/* Animated Border */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-[-100%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,var(--accent)_0%,#ffffff_50%,var(--accent)_100%)] opacity-30" />
          </div>

          <div className="relative z-10 flex items-center justify-center gap-3 h-full w-[calc(100%-2px)] rounded-[6px] bg-accent">
            <svg
              className="h-[18px] w-[18px]"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>Continue with Google</span>
          </div>
        </a>

        {/* Section 4 - Footer */}
        <p className="text-xs text-foreground-subtle text-center mt-6">
          Privacy-first by design. Your emails never leave your control.
        </p>
      </div>
    </div>
  )
}
