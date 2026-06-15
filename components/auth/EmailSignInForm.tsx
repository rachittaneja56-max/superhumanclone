'use client'
import { useState } from 'react'
import { useSignIn, useSignUp } from '@clerk/nextjs'
import { Mail, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react'

export function EmailSignInForm({ callbackUrl = '/' }: { callbackUrl?: string }) {
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signIn || !signUp || !email) return

    const verificationUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/sso-callback` 
      : ''

    setIsLoading(true)
    setError(null)

    try {
      // Attempt to start sign-in with email link
      await signIn.create({ identifier: email })
      const emailLinkFactor = signIn.supportedFirstFactors?.find(
        (factor: any) => factor.strategy === 'email_link'
      )

      if (emailLinkFactor) {
        // User exists, send sign-in link
        const { emailAddressId } = emailLinkFactor as any
        await signIn.emailLink.sendLink({
          emailAddressId,
          verificationUrl,
        })
        setIsSuccess(true)
      } else {
        // User might not exist or doesn't have email_link enabled
        // Try sign-up instead
        await signUp.create({ emailAddress: email })
        await signUp.verifications.sendEmailLink({
          verificationUrl,
        })
        setIsSuccess(true)
      }
    } catch (err: any) {
      console.error('Error with email sign-in:', err)
      // If error is about user not found during sign-in, try sign-up
      if (err?.errors?.[0]?.code === 'form_identifier_not_found') {
        try {
          await signUp.create({ emailAddress: email })
          await signUp.verifications.sendEmailLink({
            verificationUrl,
          })
          setIsSuccess(true)
          return
        } catch (signUpErr: any) {
          setError(signUpErr?.errors?.[0]?.message || 'Failed to send login link.')
        }
      } else {
        setError(err?.errors?.[0]?.message || 'Failed to send login link. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
        <CheckCircle2 className="h-6 w-6 text-green-500 mb-2" />
        <h3 className="text-sm font-medium text-foreground">Check your email</h3>
        <p className="text-xs text-foreground-muted mt-1">
          We sent a magic link to <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Mail className="h-4 w-4 text-foreground-muted" />
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          required
          disabled={isLoading || !signIn || !signUp}
          className="w-full bg-background border border-border rounded-lg py-2.5 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading || !email || !signIn || !signUp}
        className={`
          flex h-11 w-full items-center justify-center gap-2 rounded-lg
          bg-surface border border-border text-foreground font-medium text-sm
          transition-all duration-200 hover:bg-surface-raised disabled:opacity-50
        `}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <span>Continue with Email</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  )
}
