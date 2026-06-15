import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

export default function SSOCallback() {
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
        {/* The actual Clerk component that processes the OAuth response */}
        <AuthenticateWithRedirectCallback />
      </div>
    </div>
  )
}
