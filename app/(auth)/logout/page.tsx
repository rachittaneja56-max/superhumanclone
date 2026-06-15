import Link from 'next/link'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { CheckCircle2 } from 'lucide-react'

export default function LogoutPage() {
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

        {/* Section 2 - Success Message */}
        <div className="mt-8 flex flex-col items-center justify-center text-center">
          <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
          <h2 className="text-lg font-medium text-foreground">
            You have been signed out
          </h2>
          <p className="text-sm text-foreground-muted mt-1">
            It&apos;s safe to close this window now.
          </p>
        </div>

        {/* Separator */}
        <div className="h-[1px] w-full bg-border my-8" />

        {/* Section 3 - Return to Login Button */}
        <Link
          href="/login"
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
            <span>Return to Login</span>
          </div>
        </Link>

        {/* Section 4 - Footer */}
        <p className="text-xs text-foreground-subtle text-center mt-6">
          Privacy-first by design. Your emails never leave your control.
        </p>
      </div>
    </div>
  )
}
