import { SignInButton } from '@/components/auth/SignInButton'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>
}) {
  const { error, callbackUrl } = await searchParams

  let errorMessage = error ? 'Sign-in failed. Please try again.' : ''

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

        {/* Section 3 - SignInButton */}
        <SignInButton callbackUrl={callbackUrl} />

        {/* Section 4 - Footer */}
        <p className="text-xs text-foreground-subtle text-center mt-6">
          Privacy-first by design. Your emails never leave your control.
        </p>
      </div>
    </div>
  )
}
